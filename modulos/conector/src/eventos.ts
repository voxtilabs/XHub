import type { PoolClient } from "pg";

/**
 * Evento que el conector emite cuando una conversación de XContact termina, para
 * que otros módulos (tickets) reaccionen. El conector NO conoce a tickets: publica
 * el evento por el outbox y sigue. Desacople por eventos (ADR 0002/0005).
 */
export interface ConversacionTerminada {
  clienteId: string;
  canal: string;           // telefono, whatsapp, webchat...
  identidad: string;       // teléfono E.164, id de canal...
  dedupeId: string;        // id de la conversación en XContact
  mensajes: { autor: string; texto: string }[];
  asunto?: string;
}

/** Firma del emisor de outbox que el conector recibe inyectado (del núcleo). */
export type Emitir = (c: PoolClient, e: { clienteId?: string | null; modulo: string; tipo: string; payload: Record<string, unknown> }) => Promise<void>;

/** Publica la conversación terminada por el outbox. Idempotente aguas abajo. */
export async function publicarConversacionTerminada(c: PoolClient, emitir: Emitir, conv: ConversacionTerminada): Promise<void> {
  await emitir(c, {
    clienteId: conv.clienteId,
    modulo: "conector",
    tipo: "conversacion.terminada",
    payload: { canal: conv.canal, identidad: conv.identidad, dedupeId: conv.dedupeId, mensajes: conv.mensajes, asunto: conv.asunto ?? null },
  });
}
