import type { PoolClient } from "pg";
import { pool } from "./pool.js";

export interface EntradaAudit {
  clienteId?: string | null;
  actorTipo: "usuario" | "plataforma" | "sistema" | "agente";
  actorId?: string;
  accion: string;
  recurso?: string;
  recursoId?: string;
  resultado: "ok" | "denegado" | "error";
  metadata?: Record<string, unknown>;
}

/** Escribe una entrada. El hash lo encadena el trigger. */
export async function auditar(e: EntradaAudit, c?: PoolClient): Promise<void> {
  const q = `insert into nucleo.auditoria
    (cliente_id, actor_tipo, actor_id, accion, recurso, recurso_id, resultado, metadata)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`;
  const vals = [
    e.clienteId ?? null, e.actorTipo, e.actorId ?? null, e.accion,
    e.recurso ?? null, e.recursoId ?? null, e.resultado, JSON.stringify(e.metadata ?? {}),
  ];
  if (c) await c.query(q, vals);
  else await pool().query(q, vals);
}

export interface Verificacion { valida: boolean; entradas: number; rotaEn: number | null; }

/**
 * Recorre la cadena RECALCULANDO el hash de cada fila desde su contenido y el
 * hash previo — igual que el trigger. Detecta tanto un enlace roto como una fila
 * cuyo contenido fue alterado. Devuelve dónde se rompió (o null si está intacta).
 */
export async function verificarCadena(): Promise<Verificacion> {
  const { rows } = await pool().query(
    `select seq, cliente_id, actor_tipo, actor_id, accion, recurso, recurso_id,
            resultado, metadata::text as metadata_txt, hash_prev, hash
       from nucleo.auditoria order by seq asc`,
  );
  const { createHash } = await import("node:crypto");
  let prev: string | null = null;
  for (const r of rows) {
    if (r.hash_prev !== prev) return { valida: false, entradas: rows.length, rotaEn: r.seq };
    const contenido =
      (prev ?? "") + "|" + r.actor_tipo + "|" + (r.actor_id ?? "") + "|" + r.accion +
      "|" + (r.recurso ?? "") + "|" + (r.recurso_id ?? "") + "|" + r.resultado +
      "|" + r.metadata_txt;
    const esperado = createHash("sha256").update(contenido).digest("hex");
    if (esperado !== r.hash) return { valida: false, entradas: rows.length, rotaEn: r.seq };
    prev = r.hash;
  }
  return { valida: true, entradas: rows.length, rotaEn: null };
}

export interface FiltroAudit { clienteId?: string; actor?: string; recurso?: string; desde?: string; hasta?: string; limite?: number; }
export interface EntradaAuditoria {
  seq: number; clienteId: string | null; actorTipo: string; actorId: string | null;
  accion: string; recurso: string | null; recursoId: string | null; resultado: string; creadoEn: string;
}

/** Explorador de auditoría (#79): lista filtrada por cliente/actor/recurso/fecha, más nueva primero. */
export async function listarAuditoria(f: FiltroAudit = {}): Promise<EntradaAuditoria[]> {
  const cond: string[] = []; const p: unknown[] = [];
  if (f.clienteId) { p.push(f.clienteId); cond.push(`cliente_id = $${p.length}`); }
  if (f.actor) { p.push(`%${f.actor}%`); cond.push(`(actor_id ilike $${p.length} or actor_tipo ilike $${p.length})`); }
  if (f.recurso) { p.push(`%${f.recurso}%`); cond.push(`(recurso ilike $${p.length} or accion ilike $${p.length})`); }
  if (f.desde) { p.push(f.desde); cond.push(`creado_en >= $${p.length}`); }
  if (f.hasta) { p.push(f.hasta); cond.push(`creado_en <= $${p.length}`); }
  p.push(Math.min(Math.max(f.limite ?? 100, 1), 500));
  const where = cond.length ? "where " + cond.join(" and ") : "";
  const { rows } = await pool().query(
    `select seq, cliente_id as "clienteId", actor_tipo as "actorTipo", actor_id as "actorId",
            accion, recurso, recurso_id as "recursoId", resultado, creado_en as "creadoEn"
       from nucleo.auditoria ${where} order by seq desc limit $${p.length}`, p);
  return rows as EntradaAuditoria[];
}
