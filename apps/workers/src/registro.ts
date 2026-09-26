import type { ConsumidorEvento } from "@xhub/db";
import { consumidorSupresion } from "@xhub/modulo-tickets";
import { crearConsumidorTriage } from "@xhub/modulo-tickets";
import { nucleo } from "./nucleo.js";

/**
 * El ÚNICO lugar donde se listan los consumidores del outbox. Añadir un módulo que
 * reacciona a eventos = agregar una línea aquí. El despachador es genérico y no los
 * conoce; se los inyecta este registro (frontera de módulos respetada).
 */
export function construirRegistro(): ConsumidorEvento[] {
  const triage = crearConsumidorTriage(nucleo);
  return [
    { tipo: consumidorSupresion.tipo, consumidor: consumidorSupresion.consumidor,
      manejar: (c, ev) => consumidorSupresion.manejar(c, ev as never) },
    { tipo: triage.tipo, consumidor: triage.consumidor,
      manejar: (c, ev) => triage.manejar(c, ev as never) },
  ];
}
