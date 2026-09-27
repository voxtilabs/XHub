import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conCliente, conPlataforma } from "@xhub/db";
import { permisosDe, CATALOGO_PERMISOS } from "@xhub/modulo-nucleo";
import { crearModuloTickets, contextoOmnicanal, reincidencia } from "@xhub/modulo-tickets";
import { nucleo } from "../nucleo.js";
import { enviarCorreo } from "../correo.js";
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
type CtxT = { clienteId: string; usuarioId: string; rol: string; esAdmin: boolean; permisos: string[] };
const ESTADOS = new Set(["nuevo", "abierto", "pendiente", "resuelto", "cerrado"]);
const CANALES = new Set(["telefono", "email", "rut", "xcontact", "webchat", "instagram", "messenger"]);

async function guard(req: FastifyRequest): Promise<CtxT> {
  let sesion: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try { sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); } catch { sesion = null; }
  const u = sesion?.user as { id?: string; rol?: string; clienteId?: string } | undefined;
  if (!u?.id) throw new ErrorApi("NO_AUTENTICADO", "Sesión requerida");
  if (!u.clienteId) throw new ErrorApi("SIN_PERMISO", "Tu usuario no está asociado a un cliente");
  const esAdmin = u.rol === "admin_cliente";
  const permisos = esAdmin ? CATALOGO_PERMISOS.map((p) => p.clave) : await conPlataforma((c) => permisosDe(c, u.id!));
  return { clienteId: u.clienteId, usuarioId: u.id, rol: u.rol ?? "usuario", esAdmin, permisos };
}
function exigir(ctx: CtxT, permiso: string): void {
  if (!ctx.esAdmin && !ctx.permisos.includes(permiso)) throw new ErrorApi("SIN_PERMISO", `Requiere el permiso ${permiso}`);
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
        const cnt = await c.query("select estado, count(*)::int n from tickets group by estado");
        const porEstado: Record<string, number> = {}; for (const x of cnt.rows) porEstado[x.estado] = x.n;
        const sinAsignar = (await c.query("select count(*)::int n from tickets where asignado_a is null and estado not in ('resuelto','cerrado')")).rows[0].n;
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
                  categoria, etiquetas, urgencia_detectada, sla_primera_resp_vence, sla_resolucion_vence,
                  primera_respuesta_en, resuelto_en, satisfaccion, sla_incumplido, creado_en, actualizado_en
             from tickets where id=$1`, [id]);
        if (t.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
        return { ...t.rows[0], puede: { gestionar: ctx.esAdmin || ctx.permisos.includes("bandeja.gestionar") } };
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
      const sugerencia = await conCliente(ctx.clienteId, (c) => T.sugerirRespuesta(c, id));
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
      return conCliente(ctx.clienteId, (c) => T.crearTicket(c, {
        canal: b.canal!, identidad: b.identidad!, asunto: b.asunto!.trim(),
        prioridad: b.prioridad as never, cuerpo: b.cuerpo, categoria: b.categoria,
      }));
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
  }, { prefix: "/cliente" });
}
