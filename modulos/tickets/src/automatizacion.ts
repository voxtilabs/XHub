import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";

async function cid(c: PoolClient): Promise<string> {
  const v = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  if (!v) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return v;
}

/**
 * Auto-asigna un ticket al siguiente agente ACTIVO del equipo, en round-robin.
 * El puntero es por equipo; salta a agentes inactivos. Devuelve el agente elegido
 * o null si el equipo no tiene agentes.
 */
export async function autoAsignar(c: PoolClient, ticketId: string, equipoId: string): Promise<string | null> {
  const clienteId = await cid(c);
  // agentes activos del equipo, orden estable
  const ags = await c.query(
    "select usuario_id from ticket_agentes where cliente_id=$1 and equipo_id=$2 and activo=true and rol in ('agente','supervisor') order by usuario_id",
    [clienteId, equipoId]);
  if (ags.rowCount === 0) return null;
  // avanzar puntero atómicamente
  const rr = await c.query(
    `insert into ticket_rr (cliente_id, equipo_id, ultimo_idx) values ($1,$2,0)
       on conflict (cliente_id, equipo_id) do update set ultimo_idx = (ticket_rr.ultimo_idx + 1) % $3
       returning ultimo_idx`,
    [clienteId, equipoId, ags.rowCount]);
  const idx = rr.rows[0].ultimo_idx;
  const elegido = ags.rows[idx].usuario_id;
  await c.query("update tickets set asignado_a=$2, actualizado_en=now() where id=$1 and cliente_id=$3", [ticketId, elegido, clienteId]);
  return elegido;
}

/** Marca presencia de un usuario en un ticket (heartbeat). */
export async function verTicket(c: PoolClient, ticketId: string, usuarioId: string): Promise<void> {
  const clienteId = await cid(c);
  await c.query(
    `insert into ticket_presencia (cliente_id, ticket_id, usuario_id) values ($1,$2,$3)
       on conflict (cliente_id, ticket_id, usuario_id) do update set visto_en=now()`,
    [clienteId, ticketId, usuarioId]);
}

/** Otros usuarios viendo el mismo ticket en los últimos `segundos` (colisión). */
export async function otrosViendo(c: PoolClient, ticketId: string, usuarioId: string, segundos = 30): Promise<string[]> {
  const clienteId = await cid(c);
  const r = await c.query(
    `select usuario_id::text from ticket_presencia
       where cliente_id=$1 and ticket_id=$2 and usuario_id <> $3 and visto_en > now() - ($4 || ' seconds')::interval`,
    [clienteId, ticketId, usuarioId, String(segundos)]);
  return r.rows.map((x) => x.usuario_id);
}

export interface DisparadorAuto { autoAsignarEquipo: boolean; autoRespuesta: string | null; }
/**
 * Aplica los disparadores al crear un ticket: auto-asignación round-robin y
 * auto-respuesta de acuse. Idempotente por ticket (solo la primera vez).
 */
export async function aplicarDisparadores(
  c: PoolClient, ticketId: string, equipoId: string | null, cfg: DisparadorAuto,
): Promise<{ asignadoA: string | null }> {
  let asignadoA: string | null = null;
  if (cfg.autoAsignarEquipo && equipoId) asignadoA = await autoAsignar(c, ticketId, equipoId);
  if (cfg.autoRespuesta) {
    const clienteId = await cid(c);
    await c.query(
      "insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, cuerpo) values ($1,$2,'sistema',$3)",
      [clienteId, ticketId, cfg.autoRespuesta]);
  }
  return { asignadoA };
}
