import type { PoolClient } from "pg";
import { pool } from "./pool.js";

export interface Evento { clienteId?: string | null; modulo: string; tipo: string; payload?: Record<string, unknown>; }

/** Emite un evento DENTRO de la transacción de negocio (recibe el client). */
export async function emitir(c: PoolClient, e: Evento): Promise<void> {
  await c.query(
    `insert into nucleo.outbox (cliente_id, modulo, tipo, payload) values ($1,$2,$3,$4)`,
    [e.clienteId ?? null, e.modulo, e.tipo, JSON.stringify(e.payload ?? {})],
  );
}

export interface FilaOutbox { id: string; cliente_id: string | null; modulo: string; tipo: string; payload: unknown; intentos: number; }

/**
 * Toma un lote de pendientes con SKIP LOCKED (varios despachadores no se pisan),
 * saltando los módulos apagados. Devuelve las filas bloqueadas para este proceso.
 */
export async function tomarPendientes(
  c: PoolClient, modulosActivos: string[], limite = 50,
): Promise<FilaOutbox[]> {
  const { rows } = await c.query(
    `select id, cliente_id, modulo, tipo, payload, intentos
       from nucleo.outbox
      where procesado_en is null and modulo = any($1)
      order by creado_en asc
      limit $2 for update skip locked`,
    [modulosActivos, limite],
  );
  return rows as FilaOutbox[];
}

/** Entrega única por consumidor. Devuelve true si le toca procesar (no lo hizo antes). */
export async function marcarParaConsumidor(c: PoolClient, eventoId: string, consumidor: string): Promise<boolean> {
  const r = await c.query(
    `insert into nucleo.eventos_procesados (evento_id, consumidor) values ($1,$2)
       on conflict do nothing returning evento_id`,
    [eventoId, consumidor],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function marcarProcesado(c: PoolClient, id: string): Promise<void> {
  await c.query("update nucleo.outbox set procesado_en = now() where id = $1", [id]);
}

export async function marcarError(c: PoolClient, id: string, error: string): Promise<void> {
  await c.query(
    "update nucleo.outbox set intentos = intentos + 1, ultimo_error = $2 where id = $1",
    [id, error.slice(0, 500)],
  );
}

export async function pendientes(): Promise<number> {
  const r = await pool().query("select count(*)::int n from nucleo.outbox where procesado_en is null");
  return r.rows[0].n;
}
