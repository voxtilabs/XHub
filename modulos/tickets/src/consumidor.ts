import type { PoolClient } from "pg";
import type { NucleoApi } from "@xhub/sdk-modulo";
import { crearModuloTickets } from "./index.js";

export interface EventoConversacion {
  clienteId: string;
  payload: { canal: string; identidad: string; dedupeId: string; mensajes: { autor: string; texto: string }[]; asunto?: string | null; abandonada?: boolean };
}

/**
 * Consumidor de 'conversacion.terminada': aplica el TRIAGE. Según la config del
 * cliente (modo + umbral), crea el ticket, lo sugiere, o lo descarta. Idempotente
 * por conversación. Es el puente entre XContact y xTickets, por evento (sin acople).
 */
export function crearConsumidorTriage(nucleo: NucleoApi) {
  const T = crearModuloTickets(nucleo);
  return {
    tipo: "conversacion.terminada",
    consumidor: "tickets:triage-conversacion",
    async manejar(c: PoolClient, ev: EventoConversacion): Promise<{ accion: string; ticketId?: string }> {
      const p = ev.payload;
      if (!p?.mensajes?.length) return { accion: "descartado" };
      const r = await T.triarConversacion(c, {
        canal: p.canal, identidad: p.identidad, dedupeId: p.dedupeId,
        mensajes: p.mensajes, asunto: p.asunto ?? undefined, abandonada: p.abandonada,
      });
      return { accion: r.accion, ticketId: r.ticket?.id };
    },
  };
}
