import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi } from "@xhub/core";
import { conPlataforma } from "@xhub/db";
import {
  resolverAdmin, crearCliente, cambiarEstado, fijarEntitlement, crearLlave,
  fijarCuota, cuotaDe, listarClientesAdmin,
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
