import type { ConsumidorEvento } from "@xhub/db";
import { consumidorSupresion } from "@xhub/modulo-tickets";
import { crearConsumidorTriage } from "@xhub/modulo-tickets";
import { encolarEvento } from "@xhub/modulo-nucleo";
import { nucleo } from "./nucleo.js";

/**
 * Eventos del dominio que un cliente puede recibir por webhook saliente. El fan-out
 * a `webhook_entregas` corre DENTRO de la tx del despachador (solo INSERT, sin HTTP:
 * ley 7); el POST real lo hace el worker de entrega. El matcher del despachador es por
 * tipo exacto, así que registramos un consumidor por tipo, todos con el mismo id estable.
 */
const EVENTOS_WEBHOOK = [
  "ticket.creado", "ticket.estado", "ticket.asignado",
  "persona.fusionada", "oportunidad.creada", "oportunidad.ganada", "conversacion.terminada",
];

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
    ...EVENTOS_WEBHOOK.map((tipo): ConsumidorEvento => ({
      tipo, consumidor: "nucleo:webhooks-salientes",
      manejar: (c, ev) => encolarEvento(c, ev.tipo, ev.payload),
    })),
  ];
}
