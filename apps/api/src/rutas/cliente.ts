import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conPlataforma } from "@xhub/db";
import {
  limiteUsuariosDe, contarUsuariosCliente, listarUsuariosCliente,
  permisosDe, fijarPermisos, usuarioDeCliente, CATALOGO_PERMISOS, entitlementsDe,
} from "@xhub/modulo-nucleo";
import { auth } from "../auth.js";
import { leerCookieSoporte } from "../soporte.js";
import * as E from "../esquemas.js";

/**
 * Consola del ADMIN DE CLIENTE. Aquí el cliente gestiona SU propio xHub: crea sus
 * usuarios y les reparte permisos por módulo, siempre dentro del tope que le fijó la
 * plataforma. Todo queda acotado a SU clienteId (sacado de la sesión, nunca del body),
 * así un cliente no puede tocar a otro.
 */
interface CtxCliente { clienteId: string; usuarioId: string; }

async function guardCliente(req: FastifyRequest): Promise<CtxCliente> {
  let sesion: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try { sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); } catch { sesion = null; }
  const u = sesion?.user as { id?: string; rol?: string; clienteId?: string } | undefined;
  if (!u) throw new ErrorApi("NO_AUTENTICADO", "Sesión requerida");
  if (u.rol !== "admin_cliente") throw new ErrorApi("SIN_PERMISO", "Solo el administrador del cliente opera esta consola");
  if (!u.clienteId) throw new ErrorApi("SIN_PERMISO", "El usuario no está asociado a un cliente");
  return { clienteId: u.clienteId, usuarioId: u.id! };
}

// Verifica que el usuario objetivo pertenece al MISMO cliente (no cruzar clientes).
async function exigirMismoCliente(clienteId: string, usuarioId: string): Promise<void> {
  const ref = await conPlataforma((c) => usuarioDeCliente(c, usuarioId));
  if (!ref || ref.clienteId !== clienteId) throw new ErrorApi("NO_ENCONTRADO", "Ese usuario no existe en tu cliente");
}

export function registrarRutasCliente(app: FastifyInstance): void {
  app.register(async (cli) => {
    cli.decorateRequest("ctxCliente", null);
    cli.addHook("onRequest", async (req: FastifyRequest) => { (req as unknown as { ctxCliente?: CtxCliente }).ctxCliente = await guardCliente(req); });
    const ctx = (req: FastifyRequest) => (req as unknown as { ctxCliente: CtxCliente }).ctxCliente;

    // Contexto de la consola (para el encabezado del panel del cliente)
    cli.get("/contexto", async (req) => {
      const { clienteId } = ctx(req);
      return conPlataforma(async (c) => ({
        clienteId,
        limite: await limiteUsuariosDe(c, clienteId),
        usados: await contarUsuariosCliente(c, clienteId),
      }));
    });

    // Catálogo de permisos que el admin puede repartir
    cli.get("/permisos", async () => ({ datos: CATALOGO_PERMISOS }));

    // Usuarios de MI cliente, cada uno con sus permisos + el tope
    cli.get("/usuarios", async (req) => {
      const { clienteId } = ctx(req);
      return conPlataforma(async (c) => {
        const usuarios = await listarUsuariosCliente(c, clienteId);
        const conPermisos = [];
        for (const u of usuarios) conPermisos.push({ ...u, permisos: await permisosDe(c, u.id) });
        return { limite: await limiteUsuariosDe(c, clienteId), usados: usuarios.length, usuarios: conPermisos };
      });
    });

    // Crear un usuario de mi equipo (rol 'usuario'), respetando el tope de plataforma
    cli.post("/usuarios", async (req) => {
      const { clienteId } = ctx(req);
      const b = E.validar(E.crearUsuarioEquipo, req.body);
      const [usados, limite] = await conPlataforma(async (c) =>
        [await contarUsuariosCliente(c, clienteId), await limiteUsuariosDe(c, clienteId)] as const);
      if (usados >= limite)
        throw new ErrorApi("CONFLICTO", `Alcanzaste tu tope de usuarios (${limite}). Pídele a la plataforma subirlo.`, { usados, limite });
      const context = await auth.$context;
      const ia = context.internalAdapter as unknown as {
        findUserByEmail(e: string): Promise<unknown>;
        createUser(d: Record<string, unknown>): Promise<{ id?: string; user?: { id: string } }>;
        linkAccount(d: Record<string, unknown>): Promise<unknown>;
      };
      if (await ia.findUserByEmail(b.email)) throw new ErrorApi("VALIDACION", "Ese email ya tiene cuenta");
      const hash = await context.password.hash(b.password);
      const creado = await ia.createUser({ email: b.email, name: b.nombre, emailVerified: true, rol: "usuario", clienteId });
      const uid = creado.user?.id ?? creado.id!;
      await ia.linkAccount({ userId: uid, providerId: "credential", accountId: uid, password: hash });
      const permisos = await conPlataforma((c) => fijarPermisos(c, uid, b.permisos ?? []));
      return { id: uid, email: b.email, nombre: b.nombre, rol: "usuario", permisos };
    });

    // Fijar los permisos de uno de mis usuarios
    cli.put("/usuarios/:id/permisos", async (req) => {
      const { clienteId } = ctx(req);
      const { id } = req.params as { id: string };
      const b = E.validar(E.fijarPermisosUsuario, req.body);
      await exigirMismoCliente(clienteId, id);
      const permisos = await conPlataforma((c) => fijarPermisos(c, id, b.permisos));
      return { id, permisos };
    });
  }, { prefix: "/cliente" });

  // Consola de CUALQUIER usuario del cliente (agente o admin): su identidad + permisos.
  // El panel la usa para GOBERNAR la navegación y el acceso POR PERMISO (no por rol):
  // apagar "bandeja.ver" a un agente le quita la bandeja en la siguiente carga. (§4, ley 4)
  app.register(async (yo) => {
    yo.get("/yo", async (req) => {
      let sesion: Awaited<ReturnType<typeof auth.api.getSession>> = null;
      try { sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); } catch { sesion = null; }
      const u = sesion?.user as { id?: string; email?: string; name?: string; rol?: string; clienteId?: string } | undefined;
      if (!u?.id) throw new ErrorApi("NO_AUTENTICADO", "Sesión requerida");
      const sop = leerCookieSoporte(req.headers.cookie);
      if (u.rol === "plataforma" && sop && sop.a === u.id) {
        const modSop = [...(await conPlataforma((c) => entitlementsDe(c, sop.c)))];
        return { id: u.id, email: u.email ?? null, nombre: u.name ?? null, rol: "plataforma", clienteId: sop.c, esAdmin: true, esSoporte: true, motivoSoporte: sop.m, permisos: CATALOGO_PERMISOS.map((p) => p.clave), modulos: modSop };
      }
      const esAdmin = u.rol === "admin_cliente";
      // El admin de cliente tiene acceso total: recibe todas las claves del catálogo.
      const permisos = esAdmin
        ? CATALOGO_PERMISOS.map((p) => p.clave)
        : await conPlataforma((c) => permisosDe(c, u.id!));
      const modulos = u.clienteId ? [...(await conPlataforma((c) => entitlementsDe(c, u.clienteId!)))] : [];
      return { id: u.id, email: u.email ?? null, nombre: u.name ?? null, rol: u.rol ?? "usuario", clienteId: u.clienteId ?? null, esAdmin, permisos, modulos };
    });

    // Marca blanca del cliente logueado: el panel se pinta con ella (o defaults si no hay).
    yo.get("/marca", async (req) => {
      let sesion: Awaited<ReturnType<typeof auth.api.getSession>> = null;
      try { sesion = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); } catch { sesion = null; }
      const um = sesion?.user as { id?: string; rol?: string; clienteId?: string } | undefined;
      const sopm = leerCookieSoporte(req.headers.cookie);
      const cid = (um?.rol === "plataforma" && sopm && sopm.a === um.id) ? sopm.c : um?.clienteId;
      const vacia = { nombre_marca: null, logo_url: null, color_primario: null, color_acento: null };
      if (!cid) return vacia;
      return conPlataforma(async (c) => {
        const r = await c.query("select nombre_marca, logo_url, color_primario, color_acento from plataforma.clientes_marca where cliente_id=$1", [cid]);
        return r.rows[0] ?? vacia;
      });
    });
  }, { prefix: "/cliente" });

}
