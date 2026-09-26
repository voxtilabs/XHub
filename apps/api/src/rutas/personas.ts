import type { FastifyInstance } from "fastify";
import { exigirScope, fichaDePersona, buscarPersonas, exportarPersona, suprimirPersona } from "@xhub/modulo-nucleo";
import { consumidorSupresion } from "@xhub/modulo-tickets";
import { conContexto } from "../app.js";
import { validar, suprimirTitular } from "../esquemas.js";

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

  // DERECHO DE ACCESO (Ley 21.719): export portable de todo lo que xHub tiene del titular.
  app.get("/personas/:id/exportar", async (req) => {
    exigirScope(req.ctx!, "nucleo.leer");
    const { id } = req.params as { id: string };
    return conContexto(req, (c) => exportarPersona(c, id));
  });

  // DERECHO DE SUPRESIÓN (Ley 21.719): anonimiza el núcleo y, en la MISMA transacción,
  // redacta el contenido de los tickets del titular. El núcleo emite el evento y la app
  // compone el barrido de tickets (composición cross-módulo, como la NucleoApi). Motivo obligatorio.
  app.post("/personas/:id/suprimir", async (req) => {
    exigirScope(req.ctx!, "nucleo.administrar");
    const { id } = req.params as { id: string };
    const { motivo } = validar(suprimirTitular, req.body);
    return conContexto(req, async (c) => {
      const { personaId } = await suprimirPersona(c, id, motivo);
      const r = await consumidorSupresion.manejar(c, { clienteId: req.ctx!.clienteId, payload: { personaId } });
      return { suprimida: true, personaId, ticketsRedactados: r.tickets };
    });
  });
}
