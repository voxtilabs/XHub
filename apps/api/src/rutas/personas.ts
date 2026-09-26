import type { FastifyInstance } from "fastify";
import { exigirScope, fichaDePersona, buscarPersonas } from "@xhub/modulo-nucleo";
import { conContexto } from "../app.js";

export function registrarRutasPersonas(app: FastifyInstance): void {
  // Ficha 360 de una persona
  app.get("/personas/:id/ficha", async (req) => {
    exigirScope(req.ctx!, "nucleo.leer");
    const { id } = req.params as { id: string };
    return conContexto(req, (c) => fichaDePersona(c, id));
  });
  // Búsqueda
  app.get("/personas", async (req) => {
    exigirScope(req.ctx!, "nucleo.leer");
    const q = req.query as { q?: string };
    return conContexto(req, (c) => buscarPersonas(c, q.q ?? ""));
  });
}
