import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ErrorApi } from "@xhub/core";
import { conPlataforma } from "@xhub/db";
import {
  resolverAdmin, crearCliente, cambiarEstado, fijarEntitlement, crearLlave,
  fijarCuota, cuotaDe, listarClientesAdmin,
} from "@xhub/modulo-nucleo";
import { consumoDelDia } from "@xhub/cuotas";

/** Guard de superadmin: token de administrador de plataforma (cross-cliente). */
async function guardAdmin(req: FastifyRequest): Promise<void> {
  const auth = req.headers["authorization"];
  const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
  await conPlataforma((c) => resolverAdmin(c, token));  // lanza NO_AUTENTICADO si no vale
}

export function registrarRutasAdmin(app: FastifyInstance): void {
  app.register(async (admin) => {
    admin.addHook("onRequest", async (req: FastifyRequest) => { await guardAdmin(req); });

    // Crear cliente
    admin.post("/clientes", async (req) => {
      const b = req.body as { nombre: string };
      if (!b?.nombre) throw new ErrorApi("VALIDACION", "El nombre es obligatorio");
      return conPlataforma((c) => crearCliente(c, b.nombre));
    });

    // Listar clientes con sus módulos
    admin.get("/clientes", async () => ({ datos: await conPlataforma((c) => listarClientesAdmin(c)) }));

    // Cambiar estado del cliente
    admin.put("/clientes/:id/estado", async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as { estado: string };
      return conPlataforma((c) => cambiarEstado(c, id, b.estado as never));
    });

    // Encender / apagar un módulo del cliente
    admin.put("/clientes/:id/modulos/:modulo", async (req) => {
      const { id, modulo } = req.params as { id: string; modulo: string };
      const b = req.body as { encendido: boolean };
      await conPlataforma((c) => fijarEntitlement(c, id, modulo, b.encendido));
      return { cliente: id, modulo, encendido: b.encendido };
    });

    // Crear una llave de API para el cliente
    admin.post("/clientes/:id/llaves", async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as { nombre: string; scopes?: string[] };
      // la llave se muestra UNA vez
      return conPlataforma((c) => crearLlave(c, id, b?.nombre ?? "llave", b?.scopes ?? []));
    });

    // Fijar la cuota mensual del cliente
    admin.put("/clientes/:id/cuota", async (req) => {
      const { id } = req.params as { id: string };
      const b = req.body as { limiteMensual: number };
      if (!Number.isInteger(b?.limiteMensual) || b.limiteMensual < 0) throw new ErrorApi("VALIDACION", "limiteMensual inválido");
      await conPlataforma((c) => fijarCuota(c, id, b.limiteMensual));
      return { cliente: id, limiteMensual: b.limiteMensual };
    });

    // Consumo del cliente (hoy) + cuota efectiva
    admin.get("/clientes/:id/consumo", async (req) => {
      const { id } = req.params as { id: string };
      const cuota = await conPlataforma((c) => cuotaDe(c, id));
      return { ...(await consumoDelDia(id)), cuotaMensual: cuota };
    });
  }, { prefix: "/admin" });
}
