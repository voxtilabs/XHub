import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHmac } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conPlataforma, listarAuditoria, verificarCadena, auditar, type FiltroAudit } from "@xhub/db";
import {
  resolverAdmin, crearCliente, cambiarEstado, fijarEntitlement, crearLlave,
  fijarCuota, cuotaDe, listarClientesAdmin,
  fijarLimiteUsuarios, limiteUsuariosDe, contarUsuariosCliente, listarUsuariosCliente,
  resumenUsoIA, CATALOGO_SCOPES, SCOPES_VALIDOS, entitlementsDe,
  listarLlaves, actualizarScopesLlave, revocarLlave,
  reconciliarPersona, registrarInteraccion,
  asegurarEtiqueta, aplicarEtiqueta, asegurarCampo, ponerValor,
  configIA, fijarModeloDefault, fijarModeloCliente, fijarContextoCliente,
} from "@xhub/modulo-nucleo";
import { sincronizarContactosInstancia, type NucleoContactos, type DepsSondeo } from "@xhub/modulo-conector";
import { fetchXContact } from "../fetch-xcontact.js";
import { consumoDelDia } from "@xhub/cuotas";
import { fijarConfigTriage, configTriage } from "@xhub/modulo-tickets";
import { conCliente } from "@xhub/db";
import { auth } from "../auth.js";
import { probarXContact } from "../xcontact-probe.js";
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

/** Parseo seguro de un query numérico: NaN → default (evita 500 por «?dias=abc»). */
const numQ = (v: unknown, def: number): number => { const n = Number(v); return Number.isFinite(n) ? n : def; };

/** Traduce el error de una operación del conector a una causa legible en español. */
function causaLegible(e: unknown): string {
  const m = (e as Error)?.message || String(e);
  if (/NO_ENCONTRADO|no encontrada/i.test(m)) return "La instancia ya no existe.";
  if (/VALIDACION|falta la contraseña/i.test(m)) return "Falta la contraseña del supervisor.";
  if (/\b401\b|auth/i.test(m)) return "XContact rechazó la autenticación (usuario/clave o api_key).";
  if (/timeout/i.test(m)) return "XContact no respondió a tiempo (timeout).";
  if (/ECONN|fetch failed|network|getaddrinfo|socket/i.test(m)) return "No se pudo conectar con XContact.";
  return `Fallo al sincronizar: ${m}`.slice(0, 300);
}

/** Encola (o incrementa) un muerto para (instancia, tipo), con su causa en español. */
async function encolarMuerto(clienteId: string, instanciaId: string, tipo: string, carga: Record<string, unknown>, e: unknown): Promise<void> {
  await conPlataforma((c) => c.query(
    `insert into plataforma.conector_muertos (cliente_id, instancia_id, tipo, carga, causa)
       values ($1,$2,$3,$4,$5)
     on conflict (instancia_id, tipo) where resuelto_en is null
       do update set intentos = conector_muertos.intentos + 1, causa = excluded.causa, ultimo_intento = now()`,
    [clienteId, instanciaId, tipo, JSON.stringify(carga), causaLegible(e)])).catch(() => { /* no romper por la cola */ });
}

// Dependencias de composición para el orquestador de sondeo del conector: le inyectamos
// las operaciones del núcleo y el repunte de objetos de módulo (tickets/crm/leads), que
// el conector no conoce. Mismo objeto para la sync manual y para el scheduler.
const nucleoContactos: NucleoContactos = {
  reconciliarPersona: (c, ids, nombre) => reconciliarPersona(c, ids as never, nombre),
  registrarInteraccion: (c, e) => registrarInteraccion(c, e as never),
  asegurarEtiqueta: (c, n) => asegurarEtiqueta(c, n),
  aplicarEtiqueta: (c, p, e) => aplicarEtiqueta(c, p, e),
  asegurarCampo: (c, o, n, t) => asegurarCampo(c, o, n, t as never),
  ponerValor: (c, o, id, campo, v) => ponerValor(c, o, id, campo, v),
  repuntarObjetos: async (c, viejo, nuevo) => {
    await c.query("update tickets set persona_id=$1 where persona_id=$2", [nuevo, viejo]);
    await c.query("update crm_oportunidades set persona_id=$1 where persona_id=$2", [nuevo, viejo]);
    await c.query("update crm_leads set persona_id=$1 where persona_id=$2", [nuevo, viejo]);
  },
};
const depsSondeoApi: DepsSondeo = { conCliente, conPlataforma, fetchImpl: fetchXContact, nucleo: nucleoContactos };

/**
 * Ejecuta el sync de contactos de una instancia hacia el núcleo del cliente. Reutilizable
 * por la ruta de sync y por el reintento de la cola de muertos. INCREMENTAL: parte del
 * cursor guardado (id externo) y lo avanza (#59). Lanza en caso de fallo.
 */
async function ejecutarSyncContactos(clienteId: string, iid: string, password: string | undefined, limitePedido: number | undefined): Promise<Record<string, number>> {
  const inst = await conPlataforma((c) => c.query(
    "select host, usuario, credencial_ref from plataforma.instancias_xcontact where id=$2 and cliente_id=$1", [clienteId, iid]));
  if (!inst.rowCount) throw new ErrorApi("NO_ENCONTRADO", "Instancia no encontrada");
  const { host, usuario, credencial_ref } = inst.rows[0] as { host: string; usuario: string; credencial_ref: string | null };
  const clave = password || (credencial_ref ? process.env[credencial_ref] : "") || "";
  if (!usuario || !clave) throw new ErrorApi("VALIDACION", "Falta la contraseña (en el body o en la env var referenciada)");

  // Cursor guardado: parte desde el último id externo procesado (sondeo incremental #59).
  const cur = await conPlataforma((c) => c.query(
    "select cursor from plataforma.sync_cursor where instancia_id=$1 and tipo='contactos'", [iid]));
  const desde = (cur.rows[0]?.cursor as string | null) ?? null;

  const r = await sincronizarContactosInstancia(
    depsSondeoApi,
    { id: iid, clienteId, host, usuario, clave },
    { limite: Math.min(200, Math.max(1, Number(limitePedido) || 25)), desde });
  return {
    leidos: r.leidos, personas: r.personas, interacciones: r.interacciones, fusiones: r.fusiones,
    etiquetados: r.etiquetados, campos: r.campos, etiquetasCatalogo: r.etiquetasCatalogo, saltados: r.saltados,
  };
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
    // Catálogo de scopes que el superadmin puede otorgar a una llave (para el panel).
    admin.get("/scopes", async () => ({ datos: CATALOGO_SCOPES }));

    admin.post("/clientes/:id/llaves", async (req) => {
      const { id } = req.params as { id: string };
      const b = E.validar(E.crearLlave, req.body);
      let scopes = b.scopes ?? [];
      const invalidos = scopes.filter((s) => !SCOPES_VALIDOS.has(s));
      if (invalidos.length) throw new ErrorApi("VALIDACION", `Scopes inexistentes: ${invalidos.join(", ")}`, { invalidos, validos: [...SCOPES_VALIDOS] });
      // Sin scopes explícitos → todos los permitidos por los módulos ENCENDIDOS del
      // cliente (+ nucleo, siempre). Una llave sin scopes no sirve para nada: este
      // default evita ese footgun; para restringir, se envían los scopes deseados.
      if (scopes.length === 0) {
        const ent = await conPlataforma((c) => entitlementsDe(c, id));
        scopes = CATALOGO_SCOPES.filter((s) => s.modulo === "nucleo" || ent.has(s.modulo)).map((s) => s.scope);
      }
      const creada = await conPlataforma((c) => crearLlave(c, id, b.nombre, scopes));
      return { ...creada, scopes };
    });

    // Listar las llaves del cliente (sin el token: solo prefijo, scopes, uso).
    admin.get("/clientes/:id/llaves", async (req) => {
      const { id } = req.params as { id: string };
      return conPlataforma(async (c) => ({ datos: await listarLlaves(c, id) }));
    });

    // Editar los scopes de una llave existente (valida contra el catálogo).
    admin.put("/clientes/:id/llaves/:llaveId/scopes", async (req) => {
      const { id, llaveId } = req.params as { id: string; llaveId: string };
      const b = req.body as { scopes?: unknown };
      const scopes = Array.isArray(b?.scopes) ? b.scopes.filter((s): s is string => typeof s === "string") : [];
      const invalidos = scopes.filter((s) => !SCOPES_VALIDOS.has(s));
      if (invalidos.length) throw new ErrorApi("VALIDACION", `Scopes inexistentes: ${invalidos.join(", ")}`, { invalidos, validos: [...SCOPES_VALIDOS] });
      const r = await conPlataforma((c) => actualizarScopesLlave(c, id, llaveId, scopes));
      if (!r) throw new ErrorApi("NO_ENCONTRADO", "Llave no encontrada o revocada");
      return r;
    });

    // Revocar una llave.
    admin.delete("/clientes/:id/llaves/:llaveId", async (req) => {
      const { llaveId } = req.params as { llaveId: string };
      await conPlataforma((c) => revocarLlave(c, llaveId));
      return { ok: true };
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

    // Probador de conectividad XContact: test de una instancia antes de conectarla.
    admin.post("/xcontact/probe", async (req) => {
      const b = req.body as { host?: string; usuario?: string; password?: string; apiKey?: string };
      if (!b?.host?.trim() || !b?.usuario?.trim()) throw new ErrorApi("VALIDACION", "Faltan host y usuario");
      return probarXContact({ host: b.host.trim(), usuario: b.usuario.trim(), password: b.password || "", apiKey: b.apiKey || "" });
    });

    // ── Config de IA: modelo por defecto (plataforma) + override por cliente ────
    admin.get("/ia/config", async () => conPlataforma(async (c) => ({
      ...(await configIA(c)),
      // Proveedor y default de env (informativo; la llave nunca se expone).
      proveedor: (process.env.IA_API_BASE || "").includes("openrouter") ? "OpenRouter" : (process.env.IA_API_BASE || "—"),
      modeloEnv: process.env.IA_MODELO || null,
      iaActiva: Boolean(process.env.IA_API_KEY),
    })));
    admin.put("/ia/config", async (req) => {
      const b = req.body as { modeloDefault?: string | null };
      await conPlataforma((c) => fijarModeloDefault(c, b?.modeloDefault ?? null));
      return { ok: true, modeloDefault: b?.modeloDefault ?? null };
    });
    admin.put("/clientes/:id/ia-modelo", async (req) => {
      const { id } = req.params as { id: string };
      const b = (req.body ?? {}) as { modelo?: string | null; contexto?: string | null };
      if ("modelo" in b) await conPlataforma((c) => fijarModeloCliente(c, id, b.modelo ?? null));
      if ("contexto" in b) await conPlataforma((c) => fijarContextoCliente(c, id, b.contexto ?? null));
      return { ok: true };
    });

    // ── Tablero de salud de la flota XContact (#66) ─────────────────────────────
    // Todas las instancias de todos los clientes con su último scorecard + rollup.
    // 'sin_fuente' (nunca probada) ensucia el estado general a propósito.
    admin.get("/xcontact/salud", async () => {
      return conPlataforma(async (c) => {
        const inst = (await c.query(
          `select i.id, i.nombre, i.host, i.version_api, i.estado_salud,
                  i.ultima_prueba::text as ultima_prueba, i.resumen,
                  cl.id as cliente_id, cl.nombre as cliente
             from plataforma.instancias_xcontact i
             left join plataforma.clientes cl on cl.id = i.cliente_id
            order by cl.nombre nulls first, i.creada_en desc`)).rows;
        const cuenta = (e: string) => inst.filter((x) => x.estado_salud === e).length;
        const rollup = {
          total: inst.length,
          operativas: cuenta("operativa"),
          parciales: cuenta("parcial") + cuenta("degradada"),
          caidas: cuenta("caida"),
          sinProbar: cuenta("sin_probar"),
          // El estado general es el peor: una caída o una sin probar ensucia todo.
          general: inst.length === 0 ? "sin_instancias"
            : cuenta("caida") > 0 ? "caida"
            : cuenta("sin_probar") > 0 || cuenta("parcial") + cuenta("degradada") > 0 ? "parcial"
            : "operativa",
        };
        return { rollup, instancias: inst };
      });
    });

    // ── Registro de instancias de XContact por cliente (#57) ────────────────────
    // Deriva el estado de salud del último scorecard del probe.
    const estadoInstancia = (r: { alcanzable?: boolean; login?: boolean; puedeLeerColas?: boolean; puedeLeerContactos?: boolean } | null): string => {
      if (!r || !r.alcanzable) return "caida";
      if (r.login && (r.puedeLeerColas || r.puedeLeerContactos)) return "operativa";
      if (r.login) return "parcial";
      return "degradada";
    };

    admin.get("/clientes/:id/xcontact/instancias", async (req) => {
      const { id } = req.params as { id: string };
      return conPlataforma(async (c) => ({ datos: (await c.query(
        `select i.id, i.nombre, i.host, i.version_api, i.usuario, i.credencial_ref, i.estado_salud,
                i.ultima_prueba::text as ultima_prueba, i.resumen, i.creada_en::text as creada_en,
                i.sondeo_activo, i.intervalo_sondeo_seg, i.ultimo_sondeo::text as ultimo_sondeo,
                sc.cursor as sync_cursor, sc.ultimo_sync::text as sync_ultimo, sc.vueltas as sync_vueltas
           from plataforma.instancias_xcontact i
           left join plataforma.sync_cursor sc on sc.instancia_id = i.id and sc.tipo='contactos'
          where i.cliente_id=$1 order by i.creada_en desc`, [id])).rows }));
    });

    // Activar/ajustar el SONDEO incremental por instancia (#59). El scheduler de workers
    // toma las que tienen sondeo_activo cuando su intervalo vence.
    admin.put("/clientes/:id/xcontact/instancias/:iid/sondeo", async (req) => {
      const { id, iid } = req.params as { id: string; iid: string };
      const b = req.body as { activo?: boolean; intervaloSeg?: number };
      const activo = b?.activo !== false;
      const intervalo = Math.min(86400, Math.max(30, Number(b?.intervaloSeg) || 300));
      const r = await conPlataforma((c) => c.query(
        `update plataforma.instancias_xcontact set sondeo_activo=$3, intervalo_sondeo_seg=$4, actualizada_en=now()
           where id=$2 and cliente_id=$1 returning id, sondeo_activo, intervalo_sondeo_seg`,
        [id, iid, activo, intervalo]));
      if (!r.rowCount) throw new ErrorApi("NO_ENCONTRADO", "Instancia no encontrada");
      return r.rows[0];
    });

    admin.post("/clientes/:id/xcontact/instancias", async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as { nombre?: string; host?: string; versionApi?: string; usuario?: string; credencialRef?: string; resumen?: Record<string, unknown> };
      const nombre = b?.nombre?.trim(); const host = b?.host?.trim();
      if (!nombre || !host) throw new ErrorApi("VALIDACION", "Faltan nombre y host");
      // NUNCA se guarda el secreto: solo host, usuario y la REFERENCIA de la credencial.
      const estado = b.resumen ? estadoInstancia(b.resumen as never) : "sin_probar";
      const r = await conPlataforma((c) => c.query(
        `insert into plataforma.instancias_xcontact (cliente_id, nombre, host, version_api, usuario, credencial_ref, estado_salud, ultima_prueba, resumen)
           values ($1,$2,$3,$4,$5,$6,$7, case when $8::jsonb is null then null else now() end, $8)
         returning id, nombre, host, version_api, usuario, credencial_ref, estado_salud, ultima_prueba::text as ultima_prueba, resumen, creada_en::text as creada_en`,
        [id, nombre, host.replace(/^https?:\/\//, "").replace(/\/.*/, ""), b.versionApi || "v5", b.usuario || null, b.credencialRef || null, estado, b.resumen ? JSON.stringify(b.resumen) : null]));
      return r.rows[0];
    });

    // Actualizar el estado/scorecard de una instancia (tras re-probar).
    admin.put("/clientes/:id/xcontact/instancias/:iid/salud", async (req) => {
      const { id, iid } = req.params as { id: string; iid: string };
      const b = req.body as { resumen?: Record<string, unknown> };
      const estado = estadoInstancia((b?.resumen as never) ?? null);
      const r = await conPlataforma((c) => c.query(
        `update plataforma.instancias_xcontact set estado_salud=$3, resumen=$4, ultima_prueba=now(), actualizada_en=now()
           where id=$2 and cliente_id=$1 returning id, estado_salud, ultima_prueba::text as ultima_prueba`,
        [id, iid, estado, b?.resumen ? JSON.stringify(b.resumen) : null]));
      if (!r.rowCount) throw new ErrorApi("NO_ENCONTRADO", "Instancia no encontrada");
      return r.rows[0];
    });

    admin.delete("/clientes/:id/xcontact/instancias/:iid", async (req) => {
      const { id, iid } = req.params as { id: string; iid: string };
      await conPlataforma((c) => c.query("delete from plataforma.instancias_xcontact where id=$2 and cliente_id=$1", [id, iid]));
      return { ok: true };
    });

    // ── EL ESQUELETO QUE CAMINA (#69): sincroniza contactos reales de XContact →
    // personas + interacciones del cliente en el núcleo. HTTP fuera de la transacción
    // (ley 7); idempotente por dedupeId (re-sincronizar no duplica). El secreto llega
    // por el body (transitorio) o por la env var referenciada en la instancia.
    admin.post("/clientes/:id/xcontact/instancias/:iid/sincronizar", async (req) => {
      const { id, iid } = req.params as { id: string; iid: string };
      const b = req.body as { password?: string; limite?: number } | undefined;
      try {
        const r = await ejecutarSyncContactos(id, iid, b?.password, b?.limite);
        // Éxito: si había un muerto vivo para esta instancia, queda resuelto.
        await conPlataforma((c) => c.query("update plataforma.conector_muertos set resuelto_en=now() where instancia_id=$1 and tipo='sync.contactos' and resuelto_en is null", [iid]));
        return r;
      } catch (e) {
        await encolarMuerto(id, iid, "sync.contactos", { limite: b?.limite ?? 25 }, e);
        throw e;
      }
    });

    // ── Cola de muertos del conector (#56) ──────────────────────────────────────
    admin.get("/conector/muertos", async () => conPlataforma(async (c) => ({ datos: (await c.query(
      `select m.id, m.cliente_id, m.instancia_id, m.tipo, m.carga, m.causa, m.intentos,
              m.creado_en::text as creado_en, m.ultimo_intento::text as ultimo_intento,
              cl.nombre as cliente, i.nombre as instancia
         from plataforma.conector_muertos m
         left join plataforma.clientes cl on cl.id=m.cliente_id
         left join plataforma.instancias_xcontact i on i.id=m.instancia_id
        where m.resuelto_en is null order by m.ultimo_intento desc`)).rows })));

    // Reintentar un muerto: re-ejecuta la operación con su carga (clave por body o env).
    admin.post("/conector/muertos/:mid/reintentar", async (req) => {
      const { mid } = req.params as { mid: string };
      const b = req.body as { password?: string } | undefined;
      const m = await conPlataforma((c) => c.query("select cliente_id, instancia_id, tipo, carga from plataforma.conector_muertos where id=$1 and resuelto_en is null", [mid]));
      if (!m.rowCount) throw new ErrorApi("NO_ENCONTRADO", "Trabajo no encontrado o ya resuelto");
      const { cliente_id, instancia_id, carga } = m.rows[0] as { cliente_id: string; instancia_id: string; carga: { limite?: number } };
      try {
        const r = await ejecutarSyncContactos(cliente_id, instancia_id, b?.password, carga?.limite);
        await conPlataforma((c) => c.query("update plataforma.conector_muertos set resuelto_en=now() where id=$1", [mid]));
        return { resuelto: true, ...r };
      } catch (e) {
        await conPlataforma((c) => c.query("update plataforma.conector_muertos set intentos=intentos+1, causa=$2, ultimo_intento=now() where id=$1", [mid, causaLegible(e)]));
        throw e;
      }
    });

    // Descartar un muerto (marcarlo resuelto sin reintentar).
    admin.delete("/conector/muertos/:mid", async (req) => {
      const { mid } = req.params as { mid: string };
      await conPlataforma((c) => c.query("update plataforma.conector_muertos set resuelto_en=now() where id=$1", [mid]));
      return { ok: true };
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
      return conPlataforma((c) => resumenUsoIA(c, { dias: numQ(q.dias, 30) }));
    });

    // Actividad y consumo de IA de un cliente
    admin.get("/clientes/:id/ia", async (req) => {
      const { id } = req.params as { id: string };
      const q = req.query as { dias?: string };
      return conPlataforma((c) => resumenUsoIA(c, { clienteId: id, dias: numQ(q.dias, 30) }));
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
        limite: q.limite && Number.isFinite(Number(q.limite)) ? Number(q.limite) : undefined,
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
