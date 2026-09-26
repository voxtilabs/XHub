import type { PoolClient } from "pg";

/**
 * Consumidor de 'persona.suprimida' (Ley 21.719). Borra el CONTENIDO de los tickets
 * de esa persona (asunto, cuerpos de mensajes, resumen) manteniendo las FILAS —
 * el ticket es un registro que puede colgar de una factura. El número y las fechas
 * quedan; el contenido personal se va.
 */
export const consumidorSupresion = {
  tipo: "persona.suprimida",
  consumidor: "tickets:supresion-persona",
  async manejar(c: PoolClient, ev: { clienteId: string; payload: { personaId: string } }): Promise<{ tickets: number }> {
    const cid = ev.clienteId;
    const p = ev.payload.personaId;
    // vaciar contenido de los mensajes (mantener la fila y el autor_tipo)
    await c.query("update tickets_mensajes set cuerpo='[contenido suprimido]' where cliente_id=$1 and ticket_id in (select id from tickets where cliente_id=$1 and persona_id=$2)", [cid, p]);
    // anonimizar el ticket: asunto y resumen (mantener numero/estado/fechas)
    const r = await c.query("update tickets set asunto='[suprimido]', resumen=null where cliente_id=$1 and persona_id=$2", [cid, p]);
    return { tickets: r.rowCount ?? 0 };
  },
};
