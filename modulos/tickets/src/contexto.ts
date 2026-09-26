import type { PoolClient } from "pg";

/**
 * FUNCIONALIDADES ÚNICAS de xTickets: aprovechan la espina dorsal de xHub, que un
 * gestor de tickets aislado (Zendesk) NO tiene. El ticket ya conoce a la persona
 * por TODOS los canales — llamadas, WhatsApp, otros tickets, oportunidades.
 */

export interface ItemOmnicanal { tipo: string; modulo: string; ocurrioEn: string; resumen: string | null; }

/**
 * Contexto omnicanal del ticket: la historia COMPLETA de la persona a través de
 * todos los canales y módulos, leída del núcleo. Es la vista 360 dentro del ticket.
 */
export async function contextoOmnicanal(c: PoolClient, ticketId: string, limite = 30): Promise<ItemOmnicanal[]> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  const p = await c.query("select persona_id from tickets where id=$1 and cliente_id=$2", [ticketId, cid]);
  if (p.rowCount === 0) return [];
  const persona = p.rows[0].persona_id;
  const r = await c.query(
    `select tipo, modulo_origen, ocurrio_en::text as ocurrio, resumen
       from nucleo.interacciones where persona_id=$1 order by seq desc limit $2`,
    [persona, limite]);
  return r.rows.map((x) => ({ tipo: x.tipo, modulo: x.modulo_origen, ocurrioEn: x.ocurrio, resumen: x.resumen }));
}

export interface Reincidencia { totalTickets: number; ultimos30: number; esRecurrente: boolean; mismoCanal: Record<string, number>; }

/**
 * Detección de reincidencia: cuántos tickets abrió esta persona, y si es recurrente
 * (≥3 en 30 días). Deja ver al agente "este cliente ya reclamó varias veces".
 */
export async function reincidencia(c: PoolClient, ticketId: string): Promise<Reincidencia> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  const p = await c.query("select persona_id from tickets where id=$1 and cliente_id=$2", [ticketId, cid]);
  if (p.rowCount === 0) return { totalTickets: 0, ultimos30: 0, esRecurrente: false, mismoCanal: {} };
  const persona = p.rows[0].persona_id;
  const r = await c.query(
    `select count(*)::int total,
       count(*) filter (where creado_en > now() - interval '30 days')::int u30
     from tickets where cliente_id=$1 and persona_id=$2`, [cid, persona]);
  const canales = await c.query(
    `select canal_origen, count(*)::int n from tickets where cliente_id=$1 and persona_id=$2 group by canal_origen`,
    [cid, persona]);
  const mismoCanal: Record<string, number> = {};
  for (const x of canales.rows) if (x.canal_origen) mismoCanal[x.canal_origen] = x.n;
  return { totalTickets: r.rows[0].total, ultimos30: r.rows[0].u30, esRecurrente: r.rows[0].u30 >= 3, mismoCanal };
}

export interface TicketRelacionado { id: string; numero: string; asunto: string; estado: string; }

/**
 * Otros tickets ABIERTOS de la misma persona — para detectar duplicados y ofrecer
 * fusionar. Zendesk no cruza canales; aquí es la misma persona del núcleo.
 */
export async function ticketsRelacionados(c: PoolClient, ticketId: string): Promise<TicketRelacionado[]> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  const r = await c.query(
    `select otros.id, otros.numero::text as numero, otros.asunto, otros.estado
       from tickets t join tickets otros
         on otros.cliente_id=t.cliente_id and otros.persona_id=t.persona_id and otros.id <> t.id
      where t.id=$1 and t.cliente_id=$2 and otros.estado in ('nuevo','abierto','pendiente')
      order by otros.numero desc`,
    [ticketId, cid]);
  return r.rows as TicketRelacionado[];
}

/**
 * Fusiona un ticket duplicado en el principal: mueve sus mensajes y lo cierra
 * marcando de qué ticket es duplicado. La persona ya es la misma (núcleo).
 */
export async function fusionarTickets(c: PoolClient, principalId: string, duplicadoId: string): Promise<void> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  await c.query("update tickets_mensajes set ticket_id=$1 where ticket_id=$2 and cliente_id=$3", [principalId, duplicadoId, cid]);
  const num = await c.query("select numero from tickets where id=$1 and cliente_id=$2", [principalId, cid]);
  await c.query(
    "insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, cuerpo, interno) values ($1,$2,'sistema',$3,true)",
    [cid, principalId, `Se fusionó un ticket duplicado en éste.`]);
  await c.query("update tickets set estado='cerrado', resumen=coalesce(resumen,'') || ' [duplicado de #' || $3 || ']', actualizado_en=now() where id=$1 and cliente_id=$2", [duplicadoId, cid, num.rows[0]?.numero ?? "?"]);
}
