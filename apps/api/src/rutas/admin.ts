import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHmac } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conPlataforma, listarAuditoria, verificarCadena, auditar, type FiltroAudit } from "@xhub/db";
import {
  resolverAdmin, crearCliente, cambiarEstado, fijarEntitlement, crearLlave,
  fijarCuota, cuotaDe, listarClientesAdmin,
  fijarLimiteUsuarios, limiteUsuariosDe, contarUsuariosCliente, listarUsuariosCliente,
  resumenUsoIA,
} from "@xhub/modulo-nucleo";
import { consumoDelDia } from "@xhub/cuotas";
import { fijarConfigTriage, configTriage } from "@xhub/modulo-tickets";
import { conCliente } from "@xhub/db";
import { auth } from "../auth.js";
import { firmarSoporte, leerCookieSoporte, cookieSoporte, cookieSoporteVacia } from "../soporte.js";
import * as E from "../esquemas.js";

/**
 * Guard de superadmin. Dos caminos:
 *  1) Token de administrador de plataforma (xhadm_, cross-cliente) — para integraciones.
 *  2) Sesión de Better Auth (usuario logueado en el panel) — para la consola web.
 * Como el registro está CERRADO (las cuentas las crea un admin), todo usuario con
 * sesión válida es superadmin de plataforma por ahora. Los roles finos (plataforma vs
 * cliente) llegan con el plugin de organizaciones.
 */
async function guardAdmin(req: FastifyRequest): Promise<void> {
  const authz = req.headers["authorization"];
  const token = typeof authz === "string" && authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (token) { await conPlataforma((c) => resolverAdmin(c, token)); return; }
  // Sin token: resolver por sesión de Better Auth. Cualquier fallo (sin cookie,
  // sesión inválida) es un 401 limpio, nunca un 500.
  let sesion: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try { sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); } catch { sesion = null; }
  if (!sesion?.user) throw new ErrorApi("NO_AUTENTICADO", "Sesión de superadmin requerida");
  // Solo admin de PLATAFORMA opera /admin/*. Un admin de cliente recibe 403 (§5, #24).
  if ((sesion.user as { rol?: string }).rol !== "plataforma")
    throw new ErrorApi("SIN_PERMISO", "Requiere administrador de plataforma");
}

export function registrarRutasAdmin(app: FastifyInstance): void {
  app.register(async (admin) => {
    admin.addHook("onRequest", async (req: FastifyRequest) => { await guardAdmin(req); });

    // Crear cliente
    admin.post("/clientes", async (req) => {
      const b = E.validar(E.crearCliente, req.body);
      return conPlataforma((c) => crearCliente(c, b.nombre));
    });

    // Listar clientes con sus módulos
    admin.get("/clientes", async () => ({ datos: await conPlataforma((c) => listarClientesAdmin(c)) }));

    // Cambiar estado del cliente
    admin.put("/clientes/:id/estado", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.cambiarEstadoCliente, req.body);
      return conPlataforma((c) => cambiarEstado(c, id, b.estado as never));
    });

    // Encender / apagar un módulo del cliente
    admin.put("/clientes/:id/modulos/:modulo", async (req) => {
      const { id, modulo } = req.params as { id: string; modulo: string };
      const b = E.validar(E.modulo, req.body);
      await conPlataforma((c) => fijarEntitlement(c, id, modulo, b.encendido));
      return { cliente: id, modulo, encendido: b.encendido };
    });

    // Crear una llave de API para el cliente
    admin.post("/clientes/:id/llaves", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.crearLlave, req.body);
      return conPlataforma((c) => crearLlave(c, id, b.nombre, b.scopes ?? []));
    });

    // Crear un ADMIN DE CLIENTE (rol admin_cliente, atado a este cliente). El registro
    // público está apagado; las cuentas las crea el admin de plataforma desde aquí.
    admin.post("/clientes/:id/usuarios", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.crearUsuarioCliente, req.body);
      // Hacer respetar el tope de usuarios que la plataforma le concede al cliente.
      const [usados, limite] = await conPlataforma(async (c) =>
        [await contarUsuariosCliente(c, id), await limiteUsuariosDe(c, id)] as const);
      if (usados >= limite)
        throw new ErrorApi("CONFLICTO", `El cliente alcanzó su tope de usuarios (${limite}). Sube el límite para crear más.`, { usados, limite });
      const ctx = await auth.$context;
      const ia = ctx.internalAdapter as unknown as {
        findUserByEmail(e: string): Promise<unknown>;
        createUser(d: Record<string, unknown>): Promise<{ id?: string; user?: { id: string } }>;
        linkAccount(d: Record<string, unknown>): Promise<unknown>;
      };
      if (await ia.findUserByEmail(b.email)) throw new ErrorApi("VALIDACION", "Ese email ya tiene cuenta");
      const hash = await ctx.password.hash(b.password);
      const creado = await ia.createUser({ email: b.email, name: b.nombre, emailVerified: true, rol: "admin_cliente", clienteId: id });
      const uid = creado.user?.id ?? creado.id!;
      await ia.linkAccount({ userId: uid, providerId: "credential", accountId: uid, password: hash });
      return { id: uid, email: b.email, rol: "admin_cliente", clienteId: id };
    });

    // Usuarios del cliente + su tope (cuántos puede crear su admin)
    admin.get("/clientes/:id/usuarios", async (req) => {
      const { id } = req.params as { id: string };
      return conPlataforma(async (c) => ({
        limite: await limiteUsuariosDe(c, id),
        usados: await contarUsuariosCliente(c, id),
        usuarios: await listarUsuariosCliente(c, id),
      }));
    });

    // Fijar el tope de usuarios del cliente (lo decide la plataforma)
    admin.put("/clientes/:id/limite-usuarios", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.fijarLimiteUsuarios, req.body);
      await conPlataforma((c) => fijarLimiteUsuarios(c, id, b.limite));
      return { cliente: id, limite: b.limite };
    });

    // Fijar la cuota mensual del cliente
    admin.put("/clientes/:id/cuota", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.fijarCuota, req.body);
      await conPlataforma((c) => fijarCuota(c, id, b.limiteMensual));
      return { cliente: id, limiteMensual: b.limiteMensual };
    });

    // PLANES (plantillas de suscripción): módulos + tope de usuarios + cuota.
    admin.get("/planes", async () => ({ datos: await conPlataforma(async (c) =>
      (await c.query("select id, nombre, modulos, limite_usuarios as \"limiteUsuarios\", cuota_mensual::int as \"cuotaMensual\" from plataforma.planes order by nombre asc")).rows) }));
    admin.post("/planes", async (req) => {
      const b = req.body as { nombre?: string; modulos?: string[]; limiteUsuarios?: number; cuotaMensual?: number };
      const nombre = b?.nombre?.trim();
      if (!nombre) throw new ErrorApi("VALIDACION", "El plan necesita nombre");
      const modulos = Array.isArray(b.modulos) ? b.modulos.filter((m) => ["tickets", "crm"].includes(m)) : [];
      return conPlataforma(async (c) => (await c.query(
        `insert into plataforma.planes (nombre, modulos, limite_usuarios, cuota_mensual) values ($1,$2,$3,$4)
           on conflict (nombre) do update set modulos=$2, limite_usuarios=$3, cuota_mensual=$4
         returning id, nombre, modulos, limite_usuarios as "limiteUsuarios", cuota_mensual::int as "cuotaMensual"`,
        [nombre, modulos, Math.max(1, Number(b.limiteUsuarios) || 5), Math.max(0, Number(b.cuotaMensual) || 100000)])).rows[0]);
    });
    admin.delete("/planes/:id", async (req) => {
      const { id } = req.params as { id: string };
      await conPlataforma((c) => c.query("update plataforma.clientes set plan_id=null where plan_id=$1", [id]).then(() => c.query("delete from plataforma.planes where id=$1", [id])));
      return { ok: true };
    });
    // Aplicar un plan a un cliente: enciende/apaga módulos, fija tope y cuota. Auditado.
    admin.post("/clientes/:id/aplicar-plan", async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as { planId?: string };
      if (!b?.planId) throw new ErrorApi("VALIDACION", "Falta el plan");
      const res = await conPlataforma(async (c) => {
        const p = (await c.query("select nombre, modulos, limite_usuarios, cuota_mensual from plataforma.planes where id=$1", [b.planId])).rows[0];
        if (!p) throw new ErrorApi("NO_ENCONTRADO", "El plan no existe");
        for (const mod of ["tickets", "crm"]) await fijarEntitlement(c, id, mod, (p.modulos as string[]).includes(mod));
        await fijarLimiteUsuarios(c, id, p.limite_usuarios);
        await fijarCuota(c, id, Number(p.cuota_mensual));
        await c.query("update plataforma.clientes set plan_id=$2 where id=$1", [id, b.planId]);
        return { plan: p.nombre, modulos: p.modulos, limiteUsuarios: p.limite_usuarios, cuotaMensual: Number(p.cuota_mensual) };
      });
      await auditar({ clienteId: id, actorTipo: "plataforma", accion: "plan.aplicado", recurso: "cliente", recursoId: id, resultado: "ok", metadata: { plan: res.plan } });
      return { ok: true, ...res };
    });

    // PANORAMA: el pulso de TODA la plataforma de un vistazo (vista 360 del superadmin).
    // Agrega por cliente los tickets (abiertos, SLA vencidos, total) recorriendo cada
    // tenant con conCliente (RLS), y el consumo de IA agregado de los últimos 30 días.
    admin.get("/panorama", async () => {
      const clientes = await conPlataforma((c) => listarClientesAdmin(c));
      const porCliente = [];
      let abiertos = 0, vencidos = 0, ticketsTotal = 0;
      for (const cl of clientes) {
        const t = await conCliente(cl.id, async (c) => ({
          abiertos: (await c.query("select count(*)::int n from tickets where estado not in ('resuelto','cerrado')")).rows[0].n as number,
          vencidos: (await c.query("select count(*)::int n from tickets where sla_incumplido=true and estado not in ('resuelto','cerrado')")).rows[0].n as number,
          total: (await c.query("select count(*)::int n from tickets")).rows[0].n as number,
        }));
        abiertos += t.abiertos; vencidos += t.vencidos; ticketsTotal += t.total;
        porCliente.push({ id: cl.id, nombre: cl.nombre, estado: cl.estado, modulos: cl.modulos, ...t });
      }
      const ia = await conPlataforma((c) => resumenUsoIA(c, { dias: 30 }));
      return {
        clientes: {
          total: clientes.length,
          activos: clientes.filter((c) => c.estado === "activo").length,
          conTickets: clientes.filter((c) => c.modulos.includes("tickets")).length,
        },
        tickets: { abiertos, vencidos, total: ticketsTotal },
        ia,
        porCliente,
      };
    });

    // Actividad y consumo de IA de TODA la plataforma (qué hizo, cuánto costó)
    admin.get("/ia", async (req) => {
      const q = req.query as { dias?: string };
      return conPlataforma((c) => resumenUsoIA(c, { dias: q.dias ? Number(q.dias) : 30 }));
    });

    // Actividad y consumo de IA de un cliente
    admin.get("/clientes/:id/ia", async (req) => {
      const { id } = req.params as { id: string };
      const q = req.query as { dias?: string };
      return conPlataforma((c) => resumenUsoIA(c, { clienteId: id, dias: q.dias ? Number(q.dias) : 30 }));
    });

    // Consumo del cliente (hoy) + cuota efectiva
    admin.get("/clientes/:id/consumo", async (req) => {
      const { id } = req.params as { id: string };
      const cuota = await conPlataforma((c) => cuotaDe(c, id));
      return { ...(await consumoDelDia(id)), cuotaMensual: cuota };
    });

    // Config de triage del cliente (cómo la IA convierte conversaciones en tickets)
    admin.get("/clientes/:id/triage", async (req) => {
      const { id } = req.params as { id: string };
      return conCliente(id, (c) => configTriage(c, id));
    });
    admin.put("/clientes/:id/triage", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.configTriage, req.body);
      await conCliente(id, (c) => fijarConfigTriage(c, id, b));
      return { cliente: id, ...b };
    });

    // Marca blanca del cliente: logo + colores. La plataforma la fija; el panel del
    // cliente se pinta con ella (white-label). Colores validados como #rrggbb.
    admin.get("/clientes/:id/marca", async (req) => {
      const { id } = req.params as { id: string };
      return conPlataforma(async (c) => {
        const r = await c.query("select cliente_id, nombre_marca, logo_url, color_primario, color_acento, correo_soporte from plataforma.clientes_marca where cliente_id=$1", [id]);
        return r.rows[0] ?? { cliente_id: id, nombre_marca: null, logo_url: null, color_primario: null, color_acento: null, correo_soporte: null };
      });
    });
    admin.put("/clientes/:id/marca", async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as { nombreMarca?: string | null; logoUrl?: string | null; colorPrimario?: string | null; colorAcento?: string | null; correoSoporte?: string | null };
      const hex = (v?: string | null) => { if (v == null || v === "") return null; if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new ErrorApi("VALIDACION", `Color inválido: ${v} (usa #rrggbb)`); return v.toLowerCase(); };
      if (b.logoUrl && b.logoUrl.length > 200000) throw new ErrorApi("VALIDACION", "El logo es demasiado grande (máx ~150KB). Usa un SVG/PNG chico o una URL.");
      const correo = b.correoSoporte?.trim() || null;
      if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new ErrorApi("VALIDACION", `Correo de soporte inválido: ${correo}`);
      const nombre = b.nombreMarca?.trim() || null, logo = b.logoUrl?.trim() || null, prim = hex(b.colorPrimario), acc = hex(b.colorAcento);
      await conPlataforma((c) => c.query(
        `insert into plataforma.clientes_marca (cliente_id, nombre_marca, logo_url, color_primario, color_acento, correo_soporte, actualizado_en)
           values ($1,$2,$3,$4,$5,$6, now())
         on conflict (cliente_id) do update set nombre_marca=$2, logo_url=$3, color_primario=$4, color_acento=$5, correo_soporte=$6, actualizado_en=now()`,
        [id, nombre, logo, prim, acc, correo]));
      return { cliente_id: id, nombre_marca: nombre, logo_url: logo, color_primario: prim, color_acento: acc, correo_soporte: correo };
    });

    // MODO SOPORTE: el superadmin entra al xHub de un cliente con MOTIVO obligatorio.
    // Cookie firmada, ventana de 30 min, auditado (inicio y fin) como actuando_por.
    admin.post("/soporte", async (req, reply) => {
      const b = req.body as { clienteId?: string; motivo?: string };
      if (!b?.clienteId) throw new ErrorApi("VALIDACION", "Falta el cliente");
      if (!b?.motivo || b.motivo.trim().length < 4) throw new ErrorApi("VALIDACION", "El motivo es obligatorio (mín. 4 caracteres)");
      const existe = await conPlataforma(async (c) => (await c.query("select 1 from plataforma.clientes where id=$1", [b.clienteId])).rowCount);
      if (!existe) throw new ErrorApi("NO_ENCONTRADO", "El cliente no existe");
      const sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      const actor = sesion?.user as { id?: string; email?: string } | undefined;
      const dur = 30 * 60;
      const token = firmarSoporte({ c: b.clienteId, a: actor?.id ?? "", m: b.motivo.trim(), e: Date.now() + dur * 1000 });
      reply.header("set-cookie", cookieSoporte(token, dur));
      await auditar({ clienteId: b.clienteId, actorTipo: "plataforma", actorId: actor?.email ?? actor?.id, accion: "soporte.iniciado", recurso: "cliente", recursoId: b.clienteId, resultado: "ok", metadata: { motivo: b.motivo.trim() } });
      return { ok: true, clienteId: b.clienteId, motivo: b.motivo.trim(), expiraSeg: dur };
    });
    admin.delete("/soporte", async (req, reply) => {
      const s2 = leerCookieSoporte(req.headers.cookie);
      reply.header("set-cookie", cookieSoporteVacia());
      const sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      const actor = sesion?.user as { id?: string; email?: string } | undefined;
      if (s2) await auditar({ clienteId: s2.c, actorTipo: "plataforma", actorId: actor?.email ?? actor?.id, accion: "soporte.finalizado", recurso: "cliente", recursoId: s2.c, resultado: "ok" });
      return { ok: true };
    });

    // Explorador de auditoría (#79): listado filtrado + integridad de la cadena.
    // Una fecha ilegible es 400 (no un filtro que se ignora en silencio).
    const filtrosAudit = (q: Record<string, string | undefined>): FiltroAudit => {
      const fecha = (v: string | undefined, campo: string) => {
        if (!v) return undefined;
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new ErrorApi("VALIDACION", `Fecha inválida en ${campo}: "${v}"`);
        return d.toISOString();
      };
      return {
        clienteId: q.cliente || undefined, actor: q.actor || undefined, recurso: q.recurso || undefined,
        desde: fecha(q.desde, "desde"), hasta: fecha(q.hasta, "hasta"),
        limite: q.limite ? Number(q.limite) : undefined,
      };
    };
    admin.get("/auditoria", async (req) => {
      const entradas = await listarAuditoria(filtrosAudit(req.query as Record<string, string>));
      const cadena = await verificarCadena();
      return { entradas, cadena };
    });
    // Exportación FIRMADA: HMAC-SHA256 con el secreto; firma null si no hay secreto
    // configurado (se ve, no se finge). La evidencia se puede verificar fuera de xHub.
    admin.get("/auditoria/exportar", async (req) => {
      const f = filtrosAudit(req.query as Record<string, string>);
      const entradas = await listarAuditoria({ ...f, limite: 500 });
      const cadena = await verificarCadena();
      const generadoEn = new Date().toISOString();
      const cuerpo = JSON.stringify({ generadoEn, cadena, entradas });
      const secreto = process.env.XHUB_AUDIT_SECRET || process.env.BETTER_AUTH_SECRET || "";
      const firma = secreto ? createHmac("sha256", secreto).update(cuerpo).digest("hex") : null;
      return { generadoEn, cadena, firma, entradas };
    });
  }, { prefix: "/admin" });
}
