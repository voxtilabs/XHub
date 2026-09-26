import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conPlataforma } from "@xhub/db";
import {
  resolverAdmin, crearCliente, cambiarEstado, fijarEntitlement, crearLlave,
  fijarCuota, cuotaDe, listarClientesAdmin,
  fijarLimiteUsuarios, limiteUsuariosDe, contarUsuariosCliente, listarUsuariosCliente,
} from "@xhub/modulo-nucleo";
import { consumoDelDia } from "@xhub/cuotas";
import { fijarConfigTriage, configTriage } from "@xhub/modulo-tickets";
import { conCliente } from "@xhub/db";
import { auth } from "../auth.js";
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
  }, { prefix: "/admin" });
}
