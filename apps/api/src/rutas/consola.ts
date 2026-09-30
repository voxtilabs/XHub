import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conCliente, conPlataforma } from "@xhub/db";
import { permisosDe, CATALOGO_PERMISOS, listarUsuariosCliente, buscarPersonas, fichaDePersona, modeloIADe, contextoIADe,
  crearRegla, activarRegla, aplicarReglas, aQuienAfectaria, listarReglas, type EjecutorAccion } from "@xhub/modulo-nucleo";
import { crearModuloTickets, contextoOmnicanal, reincidencia } from "@xhub/modulo-tickets";
import { nucleo } from "../nucleo.js";
import { asegurarPipeline } from "./crm.js";
import { enviarCorreo } from "../correo.js";
import { leerCookieSoporte } from "../soporte.js";
import { auth } from "../auth.js";

/**
 * CONSOLA DE xTICKETS para el panel (autenticada por SESIÓN, no por llave).
 *
 * El API público del cliente vive en /v1 con llave bearer + cuota. Pero el PANEL
 * entra con cookie de Better Auth, así que necesita su propia puerta. Esta consola
 * resuelve el cliente y los permisos DESDE LA SESIÓN, corre todo dentro de
 * conCliente() (fija app.cliente_id → RLS) y llama al MISMO módulo de tickets real:
 * mensajes, notas internas, SLA, urgencia, contexto omnicanal, IA. Cero demo.
 *
 * Autoriza POR PERMISO (ley de la casa nº 6): bandeja.ver para leer, bandeja.gestionar
 * para responder / cambiar estado / crear. El admin de cliente tiene acceso total.
 */
export type CtxT = { clienteId: string; usuarioId: string; rol: string; esAdmin: boolean; permisos: string[] };
const ESTADOS = new Set(["nuevo", "abierto", "pendiente", "resuelto", "cerrado"]);
const CANALES = new Set(["telefono", "email", "rut", "xcontact", "webchat", "instagram", "messenger"]);

export async function guard(req: FastifyRequest): Promise<CtxT> {
  let sesion: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try { sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); } catch { sesion = null; }
  const u = sesion?.user as { id?: string; rol?: string; clienteId?: string } | undefined;
  if (!u?.id) throw new ErrorApi("NO_AUTENTICADO", "Sesión requerida");
  const sop = leerCookieSoporte(req.headers.cookie);
  if (u.rol === "plataforma" && sop && sop.a === u.id) {
    return { clienteId: sop.c, usuarioId: u.id, rol: "plataforma", esAdmin: true, permisos: CATALOGO_PERMISOS.map((p) => p.clave) };
  }
  if (!u.clienteId) throw new ErrorApi("SIN_PERMISO", "Tu usuario no está asociado a un cliente");
  const esAdmin = u.rol === "admin_cliente";
  const permisos = esAdmin ? CATALOGO_PERMISOS.map((p) => p.clave) : await conPlataforma((c) => permisosDe(c, u.id!));
  return { clienteId: u.clienteId, usuarioId: u.id, rol: u.rol ?? "usuario", esAdmin, permisos };
}
export function exigir(ctx: CtxT, permiso: string): void {
  if (!ctx.esAdmin && !ctx.permisos.includes(permiso)) throw new ErrorApi("SIN_PERMISO", `Requiere el permiso ${permiso}`);
}

// Plantillas de automatización listas para activar (#87). Nacen apagadas.
const PLANTILLAS_REGLAS = [
  { clave: "ticket-a-crm", nombre: "Registrar cada ticket en el CRM", evento: "ticket.creado", moduloDestino: "crm", condicion: {} as Record<string, unknown>, accion: { tipo: "crear_oportunidad" } as Record<string, unknown>,
    descripcion: "Al entrar un ticket, si la persona no tiene una oportunidad abierta, crea una y enlaza el ticket. Si ya tiene, solo lo enlaza." },
  { clave: "nota-al-crear", nombre: "Dejar una nota al abrir un ticket", evento: "ticket.creado", moduloDestino: undefined as string | undefined, condicion: {} as Record<string, unknown>, accion: { tipo: "registrar_nota", texto: "Ticket de soporte recibido." } as Record<string, unknown>,
    descripcion: "Cada ticket deja una nota en la línea de tiempo de la persona." },
  { clave: "crm-urgentes", nombre: "Solo los tickets urgentes al CRM", evento: "ticket.creado", moduloDestino: "crm", condicion: { prioridad: "urgente" } as Record<string, unknown>, accion: { tipo: "crear_oportunidad" } as Record<string, unknown>,
    descripcion: "Como la anterior, pero únicamente para tickets de prioridad urgente." },
];

// Ejecutores de acciones de módulo para las reglas (la capa API sí puede tocar el CRM).
function ejecutoresRegla(clienteId: string): Record<string, EjecutorAccion> {
  return {
    crear_oportunidad: async (c, _accion, ev) => {
      const t = (await c.query("select persona_id, asunto, numero::text as numero from tickets where id=$1", [ev.objetoId])).rows[0];
      if (!t) return;
      const ya = (await c.query("select id from crm_oportunidades where persona_id=$1 and estado='abierta' order by creado_en desc limit 1", [t.persona_id])).rows[0];
      let oppId: string = ya?.id;
      if (!oppId) {
        const plId = await asegurarPipeline(c, clienteId);
        const etapaId = (await c.query("select id from crm_etapas where pipeline_id=$1 order by orden asc limit 1", [plId])).rows[0]?.id;
        oppId = (await c.query("insert into crm_oportunidades (cliente_id, persona_id, titulo, pipeline_id, etapa_id) values ($1,$2,$3,$4,$5) returning id",
          [clienteId, t.persona_id, `Ticket #${t.numero}: ${t.asunto}`, plId, etapaId])).rows[0].id;
        await nucleo.registrarInteraccion(c, { personaId: t.persona_id, tipo: "oportunidad.creada", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: oppId, resumen: `Oportunidad por automatización (ticket #${t.numero})` });
      }
      await nucleo.enlazar(c, "ticket", ev.objetoId, "genera", "oportunidad", oppId);
    },
  };
}

export function registrarConsolaTickets(app: FastifyInstance): void {
  const T = crearModuloTickets(nucleo);
  app.register(async (r) => {
    // Bandeja real (RLS + jerarquía de cursor del módulo) + conteos para las pestañas.
    r.get("/tickets", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      const q = req.query as { estado?: string; cursor?: string };
      const estado = q.estado && ESTADOS.has(q.estado) ? (q.estado as never) : undefined;
      return conCliente(ctx.clienteId, async (c) => {
        const res = await T.listarBandeja(c, { estado }, q.cursor, 50);
        const ids = res.datos.map((t) => t.id);
        if (ids.length) {
          const asg = await c.query("select id, asignado_usuario from tickets where id = any($1)", [ids]);
          const mapa = new Map(asg.rows.map((x) => [x.id, x.asignado_usuario]));
          for (const t of res.datos as Array<{ id: string; asignado_usuario?: string | null }>) t.asignado_usuario = mapa.get(t.id) ?? null;
        }
        const cnt = await c.query("select estado, count(*)::int n from tickets group by estado");
        const porEstado: Record<string, number> = {}; for (const x of cnt.rows) porEstado[x.estado] = x.n;
        const sinAsignar = (await c.query("select count(*)::int n from tickets where asignado_usuario is null and estado not in ('resuelto','cerrado')")).rows[0].n;
        const vencidos = (await c.query("select count(*)::int n from tickets where sla_incumplido=true and estado not in ('resuelto','cerrado')")).rows[0].n;
        return { ...res, porEstado, sinAsignar, vencidos, puede: { gestionar: ctx.esAdmin || ctx.permisos.includes("bandeja.gestionar") } };
      });
    });

    // Detalle: la fila completa del ticket (todos los campos que el módulo mantiene).
    r.get("/tickets/:id", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const t = await c.query(
          `select id, numero::text, persona_id, asunto, estado, prioridad, canal_origen, asignado_a, resumen,
                  categoria, etiquetas, urgencia_detectada, asignado_usuario, sla_primera_resp_vence, sla_resolucion_vence,
                  primera_respuesta_en, resuelto_en, satisfaccion, sla_incumplido, creado_en, actualizado_en
             from tickets where id=$1`, [id]);
        if (t.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
        const pid = t.rows[0].persona_id;
        const ids = (await c.query("select canal, identificador from nucleo.identidades where persona_id=$1 order by (canal='telefono') desc, (canal='email') desc, canal", [pid])).rows;
        const pnombre = (await c.query("select nombre from nucleo.personas where id=$1", [pid])).rows[0]?.nombre ?? null;
        return { ...t.rows[0], persona_nombre: pnombre, persona_identidades: ids, puede: { gestionar: ctx.esAdmin || ctx.permisos.includes("bandeja.gestionar") } };
      });
    });

    // Conversación: mensajes públicos + notas internas (interno=true), en orden.
    r.get("/tickets/:id/mensajes", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const m = await c.query("select seq, autor_tipo, autor_id, cuerpo, interno, creado_en from tickets_mensajes where ticket_id=$1 order by seq asc", [id]);
        return { datos: m.rows };
      });
    });

    // Contexto 360 (omnicanal) + reincidencia — lo que un Zendesk aislado no tiene.
    r.get("/tickets/:id/contexto", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => ({
        omnicanal: await contextoOmnicanal(c, id), reincidencia: await reincidencia(c, id),
      }));
    });

    // Sugerencia de respuesta por IA (o null si la IA está apagada).
    r.get("/tickets/:id/sugerencia", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const [modeloS, ctxIA_S] = await conPlataforma(async (c) => [await modeloIADe(c, ctx.clienteId), await contextoIADe(c, ctx.clienteId)] as const);
      const sugerencia = await conCliente(ctx.clienteId, (c) => T.sugerirRespuesta(c, id, modeloS, ctxIA_S));
      return { sugerencia };
    });

    // Responder (mensaje PÚBLICO del agente) — marca el hito de primera respuesta (SLA)
    // y, si la persona tiene email, envía la respuesta por correo con la identidad del
    // cliente (nombre de marca + correo de soporte) vía el SMTP único de plataforma.
    r.post("/tickets/:id/responder", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { cuerpo?: string };
      const cuerpo = b?.cuerpo?.trim();
      if (!cuerpo) throw new ErrorApi("VALIDACION", "El mensaje no puede ir vacío");
      // 1) Escribir la respuesta y reunir destinatario + identidad de envío (dentro de la tx).
      const datos = await conCliente(ctx.clienteId, async (c) => {
        await T.responder(c, id, ctx.usuarioId, cuerpo);
        const tk = await c.query("select numero::text as numero, persona_id, asunto from tickets where id=$1", [id]);
        if (tk.rowCount === 0) return null;
        const t = tk.rows[0];
        const em = await c.query("select identificador from nucleo.identidades where persona_id=$1 and canal='email' limit 1", [t.persona_id]);
        const marca = await c.query("select nombre_marca, correo_soporte from plataforma.clientes_marca where cliente_id=$1", [ctx.clienteId]);
        return {
          destinatario: (em.rows[0]?.identificador as string | undefined) ?? null,
          numero: t.numero as string, asunto: t.asunto as string,
          fromName: (marca.rows[0]?.nombre_marca as string | undefined) || "Soporte",
          fromEmail: (marca.rows[0]?.correo_soporte as string | undefined) || process.env.XHUB_SMTP_FROM || "no-reply@voxtilabs.cl",
        };
      });
      // 2) Enviar FUERA de la transacción (regla nº7). Degrada con motivo si no se puede.
      let correo: { enviado: boolean; motivo?: string } = { enviado: false, motivo: "la persona no tiene email" };
      if (datos?.destinatario) {
        correo = await enviarCorreo({ to: datos.destinatario, fromName: datos.fromName, fromEmail: datos.fromEmail, subject: `Re: [#${datos.numero}] ${datos.asunto}`, text: cuerpo, replyTo: datos.fromEmail });
      }
      return { ok: true, correo };
    });

    // Nota INTERNA (no la ve la persona) — la conversación privada del equipo.
    r.post("/tickets/:id/nota", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { cuerpo?: string };
      if (!b?.cuerpo?.trim()) throw new ErrorApi("VALIDACION", "La nota no puede ir vacía");
      await conCliente(ctx.clienteId, (c) => T.agregarMensaje(c, id, { autorTipo: "agente", autorId: ctx.usuarioId, cuerpo: b.cuerpo!.trim(), interno: true }));
      return { ok: true };
    });

    // Resumen de la conversación por IA (o fallback determinista). Guarda el resumen.
    r.post("/tickets/:id/resumir", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const [modeloR, ctxIA_R] = await conPlataforma(async (c) => [await modeloIADe(c, ctx.clienteId), await contextoIADe(c, ctx.clienteId)] as const);
      const resumen = await conCliente(ctx.clienteId, (c) => T.resumirConversacion(c, id, undefined, modeloR, ctxIA_R));
      return { resumen };
    });

    // Cambiar estado (máquina de transiciones del módulo; una inválida da 409).
    r.put("/tickets/:id/estado", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { estado?: string };
      if (!b?.estado || !ESTADOS.has(b.estado)) throw new ErrorApi("VALIDACION", "Estado inválido");
      return conCliente(ctx.clienteId, (c) => T.cambiarEstado(c, id, b.estado as never));
    });

    // Crear ticket a mano (crea la persona por canal+identidad si no existe).
    r.post("/tickets", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const b = req.body as { canal?: string; identidad?: string; asunto?: string; prioridad?: string; cuerpo?: string; categoria?: string };
      if (!b?.canal || !b?.identidad || !b?.asunto?.trim()) throw new ErrorApi("VALIDACION", "Faltan canal, identidad o asunto");
      if (!CANALES.has(b.canal)) throw new ErrorApi("VALIDACION", `Canal inválido: ${b.canal}. Usa uno de: ${[...CANALES].join(", ")}`);
      return conCliente(ctx.clienteId, async (c) => {
        const t = await T.crearTicket(c, {
          canal: b.canal!, identidad: b.identidad!, asunto: b.asunto!.trim(),
          prioridad: b.prioridad as never, cuerpo: b.cuerpo, categoria: b.categoria,
        });
        // Dispara las automatizaciones del cliente (ticket.creado). No rompe el alta del ticket.
        try {
          await aplicarReglas(c, {
            tipo: "ticket.creado", objetoId: t.id, personaId: t.persona_id,
            datos: { prioridad: t.prioridad, categoria: b.categoria ?? null, canal: t.canal_origen },
          }, ejecutoresRegla(ctx.clienteId));
        } catch { /* una regla que falla no debe tumbar la creación */ }
        return t;
      });
    });

    // Agentes asignables del cliente (para el dropdown de asignación).
    r.get("/agentes", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      const datos = await conPlataforma((c) => listarUsuariosCliente(c, ctx.clienteId));
      return { datos };
    });

    // Asignar el ticket a un usuario del panel (o desasignar con null). Valida que el
    // usuario pertenezca al cliente. Usa la columna de texto (Better Auth), no el uuid.
    r.put("/tickets/:id/asignar", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { usuario?: string | null };
      const usuario = b?.usuario || null;
      if (usuario) {
        const ok = await conPlataforma(async (c) => (await listarUsuariosCliente(c, ctx.clienteId)).some((u) => u.id === usuario));
        if (!ok) throw new ErrorApi("VALIDACION", "Ese usuario no pertenece a tu equipo");
      }
      await conCliente(ctx.clienteId, (c) => c.query("update tickets set asignado_usuario=$2, actualizado_en=now() where id=$1", [id, usuario]));
      return { ok: true, asignado_usuario: usuario };
    });

    // Cambiar prioridad.
    r.put("/tickets/:id/prioridad", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { prioridad?: string };
      if (!b?.prioridad || !["baja", "media", "alta", "urgente"].includes(b.prioridad)) throw new ErrorApi("VALIDACION", "Prioridad inválida");
      const r2 = await conCliente(ctx.clienteId, (c) => c.query("update tickets set prioridad=$2, actualizado_en=now() where id=$1 returning id", [id, b.prioridad]));
      if (r2.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
      return { ok: true, prioridad: b.prioridad };
    });

    // Macros (respuestas rápidas) del cliente.
    r.get("/macros", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      return conCliente(ctx.clienteId, async (c) => {
        const m = await c.query("select id, titulo, cuerpo from ticket_macros order by titulo asc");
        return { datos: m.rows };
      });
    });
    r.post("/macros", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const b = req.body as { titulo?: string; cuerpo?: string };
      if (!b?.titulo?.trim() || !b?.cuerpo?.trim()) throw new ErrorApi("VALIDACION", "La macro necesita título y cuerpo");
      return conCliente(ctx.clienteId, async (c) => {
        const r2 = await c.query("insert into ticket_macros (cliente_id, titulo, cuerpo) values ($1,$2,$3) returning id, titulo, cuerpo",
          [ctx.clienteId, b.titulo!.trim(), b.cuerpo!.trim()]);
        return r2.rows[0];
      });
    });
    r.delete("/macros/:mid", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { mid } = req.params as { mid: string };
      await conCliente(ctx.clienteId, (c) => c.query("delete from ticket_macros where id=$1", [mid]));
      return { ok: true };
    });

    // Editar las etiquetas de un ticket.
    r.put("/tickets/:id/etiquetas", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { etiquetas?: string[] };
      const etq = Array.isArray(b?.etiquetas) ? b.etiquetas.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
      const r2 = await conCliente(ctx.clienteId, (c) => c.query("update tickets set etiquetas=$2, actualizado_en=now() where id=$1 returning id", [id, etq]));
      if (r2.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
      return { ok: true, etiquetas: etq };
    });

    // CSAT: registrar la satisfacción (1..5). El módulo solo la fija en resueltos/cerrados.
    r.put("/tickets/:id/csat", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { estrellas?: number };
      if (!b?.estrellas || b.estrellas < 1 || b.estrellas > 5) throw new ErrorApi("VALIDACION", "La calificación es de 1 a 5");
      await conCliente(ctx.clienteId, (c) => T.calificar(c, id, b.estrellas!));
      return { ok: true, satisfaccion: b.estrellas };
    });

    // Categorías del cliente (lista gestionable) + fijar la categoría de un ticket.
    r.get("/categorias", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      return conCliente(ctx.clienteId, async (c) => {
        const m = await c.query("select id, nombre from ticket_categorias order by nombre asc");
        return { datos: m.rows };
      });
    });
    r.post("/categorias", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const b = req.body as { nombre?: string };
      if (!b?.nombre?.trim()) throw new ErrorApi("VALIDACION", "La categoría necesita nombre");
      return conCliente(ctx.clienteId, async (c) => {
        const r2 = await c.query("insert into ticket_categorias (cliente_id, nombre) values ($1,$2) on conflict (cliente_id, nombre) do update set nombre=excluded.nombre returning id, nombre",
          [ctx.clienteId, b.nombre!.trim()]);
        return r2.rows[0];
      });
    });
    r.put("/tickets/:id/categoria", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { categoria?: string | null };
      const cat = b?.categoria?.trim() || null;
      const r2 = await conCliente(ctx.clienteId, (c) => c.query("update tickets set categoria=$2, actualizado_en=now() where id=$1 returning id", [id, cat]));
      if (r2.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
      return { ok: true, categoria: cat };
    });

    // Buscar personas (para la ficha 360).
    r.get("/personas", async (req) => {
      const ctx = await guard(req); exigir(ctx, "personas.buscar");
      const q = req.query as { q?: string };
      return conCliente(ctx.clienteId, async (c) => ({ datos: await buscarPersonas(c, q.q ?? "") }));
    });

    // Ficha 360 de la persona: identidades + historia (tickets Y oportunidades, del núcleo)
    // + sus tickets y oportunidades. Es donde converge todo el producto.
    r.get("/personas/:id", async (req) => {
      const ctx = await guard(req); exigir(ctx, "ficha360.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const ficha = await fichaDePersona(c, id);
        const tickets = (await c.query("select id, numero::text as numero, asunto, estado, prioridad from tickets where persona_id=$1 order by numero desc limit 50", [id])).rows;
        const oportunidades = (await c.query("select id, titulo, valor::float8 as valor, etapa, estado from crm_oportunidades where persona_id=$1 order by creado_en desc limit 50", [id])).rows;
        return { ...ficha, tickets, oportunidades };
      });
    });

    // Webhooks salientes (autoservicio del admin de cliente). El secreto se muestra 1 vez.
    r.get("/webhooks", async (req) => {
      const ctx = await guard(req);
      if (!ctx.esAdmin) throw new ErrorApi("SIN_PERMISO", "Solo el administrador del cliente gestiona webhooks");
      return conCliente(ctx.clienteId, async (c) => ({
        datos: (await c.query("select id, url, eventos, activo, creado_en from plataforma.webhooks where cliente_id=$1 order by creado_en desc", [ctx.clienteId])).rows,
        entregas: (await c.query("select e.id, e.evento, w.url, e.estado, e.ultimo_codigo, e.intentos, e.creado_en from plataforma.webhook_entregas e join plataforma.webhooks w on w.id=e.webhook_id where e.cliente_id=$1 order by e.creado_en desc limit 25", [ctx.clienteId])).rows,
        eventosDisponibles: ["ticket.creado", "ticket.estado", "ticket.asignado", "persona.fusionada", "oportunidad.creada", "oportunidad.ganada"],
      }));
    });
    r.post("/webhooks", async (req) => {
      const ctx = await guard(req);
      if (!ctx.esAdmin) throw new ErrorApi("SIN_PERMISO", "Solo el administrador del cliente");
      const b = req.body as { url?: string; eventos?: string[] };
      if (!b?.url || !/^https:\/\//.test(b.url)) throw new ErrorApi("VALIDACION", "La URL debe ser https://");
      const eventos = Array.isArray(b.eventos) ? b.eventos.filter((e) => typeof e === "string").slice(0, 20) : [];
      const secreto = "whsec_" + randomBytes(24).toString("base64url");
      const id = await conCliente(ctx.clienteId, async (c) => (await c.query(
        "insert into plataforma.webhooks (cliente_id, url, eventos, secreto) values ($1,$2,$3,$4) returning id", [ctx.clienteId, b.url, eventos, secreto])).rows[0].id);
      return { id, url: b.url, eventos, secreto };
    });
    r.put("/webhooks/:id", async (req) => {
      const ctx = await guard(req);
      if (!ctx.esAdmin) throw new ErrorApi("SIN_PERMISO", "Solo el administrador del cliente");
      const { id } = req.params as { id: string };
      const b = req.body as { activo?: boolean };
      await conCliente(ctx.clienteId, (c) => c.query("update plataforma.webhooks set activo=$2 where id=$1 and cliente_id=$3", [id, b?.activo ?? true, ctx.clienteId]));
      return { ok: true, activo: b?.activo ?? true };
    });
    r.delete("/webhooks/:id", async (req) => {
      const ctx = await guard(req);
      if (!ctx.esAdmin) throw new ErrorApi("SIN_PERMISO", "Solo el administrador del cliente");
      const { id } = req.params as { id: string };
      await conCliente(ctx.clienteId, (c) => c.query("delete from plataforma.webhooks where id=$1 and cliente_id=$2", [id, ctx.clienteId]));
      return { ok: true };
    });

    // ── PUENTE xTickets ↔ xCRM ────────────────────────────────────────────────
    // La persona del ticket es la MISMA del CRM (espina dorsal). Estas dos rutas la
    // hacen visible y accionable desde el detalle del ticket: ver sus oportunidades
    // y abrir una nueva desde el propio ticket, enlazada y en su línea de tiempo.

    // Oportunidades de la persona de este ticket.
    r.get("/tickets/:id/crm", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      const { id } = req.params as { id: string };
      const puedeVer = ctx.esAdmin || ctx.permisos.includes("crm.ver") || ctx.permisos.includes("crm.gestionar");
      if (!puedeVer) return { habilitado: false, oportunidades: [], puedeGestionar: false };
      return conCliente(ctx.clienteId, async (c) => {
        const t = (await c.query("select persona_id from tickets where id=$1", [id])).rows[0];
        if (!t) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
        const oportunidades = (await c.query(
          `select o.id, o.titulo, o.valor::float8 as valor, o.moneda, o.estado,
                  (select nombre from crm_etapas e where e.id=o.etapa_id) as etapa
             from crm_oportunidades o where o.persona_id=$1 order by o.creado_en desc limit 20`, [t.persona_id])).rows;
        return { habilitado: true, oportunidades, puedeGestionar: ctx.esAdmin || ctx.permisos.includes("crm.gestionar") };
      });
    });

    // Abrir una oportunidad DESDE el ticket: misma persona, enlazada, auditada.
    r.post("/tickets/:id/crm/oportunidad", async (req) => {
      const ctx = await guard(req); exigir(ctx, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { titulo?: string; valor?: number; moneda?: string } | undefined;
      return conCliente(ctx.clienteId, async (c) => {
        const t = (await c.query("select persona_id, asunto, numero from tickets where id=$1", [id])).rows[0];
        if (!t) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
        const plId = await asegurarPipeline(c, ctx.clienteId);
        const etapaId = (await c.query("select id from crm_etapas where pipeline_id=$1 order by orden asc limit 1", [plId])).rows[0]?.id;
        const titulo = b?.titulo?.trim() || `Ticket #${t.numero}: ${t.asunto}`;
        const o = (await c.query(
          `insert into crm_oportunidades (cliente_id, persona_id, titulo, valor, moneda, pipeline_id, etapa_id)
             values ($1,$2,$3,$4,$5,$6,$7) returning id, titulo, valor::float8 as valor, moneda, estado`,
          [ctx.clienteId, t.persona_id, titulo, Math.max(0, Number(b?.valor) || 0), b?.moneda || "CLP", plId, etapaId])).rows[0];
        await nucleo.enlazar(c, "ticket", id, "origino", "oportunidad", o.id);
        await nucleo.registrarInteraccion(c, { personaId: t.persona_id, tipo: "oportunidad.creada", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Oportunidad desde ticket #${t.numero}: ${titulo}` });
        return o;
      });
    });

    // Métricas del cliente (SQL directo, sin actor): tablero honesto y real.
    r.get("/metricas", async (req) => {
      const ctx = await guard(req); exigir(ctx, "bandeja.ver");
      return conCliente(ctx.clienteId, async (c) => {
        const est = await c.query("select estado, count(*)::int n from tickets group by estado");
        const pri = await c.query("select prioridad, count(*)::int n from tickets group by prioridad");
        const abiertos = (await c.query("select count(*)::int n from tickets where estado not in ('resuelto','cerrado')")).rows[0].n;
        const vencidos = (await c.query("select count(*)::int n from tickets where sla_incumplido=true and estado not in ('resuelto','cerrado')")).rows[0].n;
        const csat = (await c.query("select coalesce(round(avg(satisfaccion)::numeric,2),0) prom, count(satisfaccion)::int n from tickets where satisfaccion is not null")).rows[0];
        const porEstado: Record<string, number> = {}; for (const x of est.rows) porEstado[x.estado] = x.n;
        const porPrioridad: Record<string, number> = {}; for (const x of pri.rows) porPrioridad[x.prioridad] = x.n;
        return { porEstado, porPrioridad, abiertos, vencidos, csat };
      });
    });

    // ── Automatizaciones (motor de reglas por cliente, #86/#87) ─────────────
    // Gobernanza del cliente: solo el administrador las gestiona. Nacen apagadas,
    // muestran "a quién afectarían hoy" antes de activarse, y una regla que apunta
    // a un módulo apagado queda PAUSADA con aviso en vez de fallar.
    const soloAdmin = (ctx: CtxT) => { if (!ctx.esAdmin) throw new ErrorApi("SIN_PERMISO", "Solo el administrador del cliente gestiona las automatizaciones"); };

    r.get("/reglas", async (req) => {
      const ctx = await guard(req); soloAdmin(ctx);
      const datos = await conCliente(ctx.clienteId, (c) => listarReglas(c));
      return { datos };
    });

    r.get("/reglas/plantillas", async (req) => {
      const ctx = await guard(req); soloAdmin(ctx);
      return { datos: PLANTILLAS_REGLAS };
    });

    r.post("/reglas", async (req) => {
      const ctx = await guard(req); soloAdmin(ctx);
      const b = req.body as { plantilla?: string; nombre?: string; evento?: string; condicion?: Record<string, unknown>; accion?: Record<string, unknown>; moduloDestino?: string };
      let datos: { nombre: string; evento: string; condicion: Record<string, unknown>; accion: Record<string, unknown>; moduloDestino?: string };
      if (b.plantilla) {
        const pl = PLANTILLAS_REGLAS.find((p) => p.clave === b.plantilla);
        if (!pl) throw new ErrorApi("VALIDACION", `Plantilla desconocida: ${b.plantilla}`);
        datos = { nombre: pl.nombre, evento: pl.evento, condicion: pl.condicion, accion: pl.accion, moduloDestino: pl.moduloDestino };
      } else {
        if (!b.nombre?.trim() || !b.evento || !(b.accion?.tipo)) throw new ErrorApi("VALIDACION", "Faltan nombre, evento o acción");
        datos = { nombre: b.nombre.trim(), evento: b.evento, condicion: b.condicion ?? {}, accion: b.accion, moduloDestino: b.moduloDestino };
      }
      const id = await conCliente(ctx.clienteId, (c) => crearRegla(c, datos));
      return { id, activa: false };
    });

    r.put("/reglas/:id/activar", async (req) => {
      const ctx = await guard(req); soloAdmin(ctx);
      const { id } = req.params as { id: string };
      const b = req.body as { activa?: boolean };
      const activa = b?.activa !== false;
      await conCliente(ctx.clienteId, (c) => activarRegla(c, id, activa));
      return { id, activa };
    });

    // Vista previa: sobre los tickets abiertos que cumplen la condición hoy,
    // cuántos serían tocados si la regla se ejecutara ahora (excluye los ya hechos).
    r.get("/reglas/:id/preview", async (req) => {
      const ctx = await guard(req); soloAdmin(ctx);
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const regla = (await listarReglas(c)).find((x) => x.id === id);
        if (!regla) throw new ErrorApi("NO_ENCONTRADO", "Regla no encontrada");
        const cond = (regla.condicion ?? {}) as Record<string, unknown>;
        const filtros = ["estado not in ('resuelto','cerrado')"]; const vals: unknown[] = [];
        if (cond.prioridad) { vals.push(cond.prioridad); filtros.push(`prioridad=$${vals.length}`); }
        if (cond.categoria) { vals.push(cond.categoria); filtros.push(`categoria=$${vals.length}`); }
        const q = await c.query(`select id from tickets where ${filtros.join(" and ")} order by creado_en desc limit 500`, vals);
        const candidatos = q.rows.map((x) => x.id as string);
        const afectados = await aQuienAfectaria(c, id, candidatos);
        return { evaluados: candidatos.length, afectados };
      });
    });
  }, { prefix: "/cliente" });
}
