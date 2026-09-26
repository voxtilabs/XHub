import type { FastifyInstance } from "fastify";
import { ErrorApi } from "@xhub/core";
import { exigirScope } from "@xhub/modulo-nucleo";
import { crearModuloTickets, contextoOmnicanal, reincidencia } from "@xhub/modulo-tickets";
import { nucleo } from "../nucleo.js";
import { conContexto } from "../app.js";

const T = crearModuloTickets(nucleo);

export function registrarRutasTickets(app: FastifyInstance): void {
  // Crear ticket
  app.post("/tickets", async (req) => {
    exigirScope(req.ctx!, "tickets.crear");
    const b = req.body as { canal: string; identidad: string; asunto: string; prioridad?: string; canalOrigen?: string; cuerpo?: string };
    if (!b?.canal || !b?.identidad || !b?.asunto) throw new ErrorApi("VALIDACION", "canal, identidad y asunto son obligatorios");
    return conContexto(req, (c) => T.crearTicket(c, b as never));
  });

  // Listar bandeja
  app.get("/tickets", async (req) => {
    exigirScope(req.ctx!, "tickets.leer");
    const q = req.query as { estado?: string; cursor?: string };
    return conContexto(req, (c) => T.listarBandeja(c, { estado: q.estado as never }, q.cursor));
  });

  // Detalle: ticket + contexto omnicanal + reincidencia (la vista 360 única)
  app.get("/tickets/:id/contexto", async (req) => {
    exigirScope(req.ctx!, "tickets.leer");
    const { id } = req.params as { id: string };
    return conContexto(req, async (c) => ({
      omnicanal: await contextoOmnicanal(c, id),
      reincidencia: await reincidencia(c, id),
    }));
  });

  // Cambiar estado
  app.put("/tickets/:id/estado", async (req) => {
    exigirScope(req.ctx!, "tickets.responder");
    const { id } = req.params as { id: string };
    const b = req.body as { estado: string };
    return conContexto(req, (c) => T.cambiarEstado(c, id, b.estado as never));
  });

  // Asignar
  app.put("/tickets/:id/asignar", async (req) => {
    exigirScope(req.ctx!, "tickets.asignar");
    const { id } = req.params as { id: string };
    const b = req.body as { usuarioId: string };
    await conContexto(req, (c) => T.asignarTicket(c, id, b.usuarioId));
    return { ok: true };
  });
}
