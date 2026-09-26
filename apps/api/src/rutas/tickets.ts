import type { FastifyInstance } from "fastify";
import { ErrorApi } from "@xhub/core";
import { exigirScope } from "@xhub/modulo-nucleo";
import { crearModuloTickets, contextoOmnicanal, reincidencia } from "@xhub/modulo-tickets";
import { nucleo } from "../nucleo.js";
import { conContexto } from "../app.js";
import * as E from "../esquemas.js";

const T = crearModuloTickets(nucleo);

export function registrarRutasTickets(app: FastifyInstance): void {
  // Crear ticket
  app.post("/tickets", async (req) => {
    exigirScope(req.ctx!, "tickets.crear");
    const b = E.validar(E.crearTicket, req.body);
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


  // Sugerencia de respuesta para el agente (IA). Devuelve null si la IA está apagada.
  app.get("/tickets/:id/sugerencia", async (req) => {
    exigirScope(req.ctx!, "tickets.responder");
    const { id } = req.params as { id: string };
    const sugerencia = await conContexto(req, (c) => T.sugerirRespuesta(c, id));
    return { sugerencia };
  });
  // Cambiar estado
  app.put("/tickets/:id/estado", async (req) => {
    exigirScope(req.ctx!, "tickets.responder");
    const { id } = req.params as { id: string };
    const b = E.validar(E.cambiarEstado, req.body);
    return conContexto(req, (c) => T.cambiarEstado(c, id, b.estado as never));
  });

  // Asignar
  app.put("/tickets/:id/asignar", async (req) => {
    exigirScope(req.ctx!, "tickets.asignar");
    const { id } = req.params as { id: string };
    const b = E.validar(E.asignar, req.body);
    await conContexto(req, (c) => T.asignarTicket(c, id, b.usuarioId));
    return { ok: true };
  });
}
