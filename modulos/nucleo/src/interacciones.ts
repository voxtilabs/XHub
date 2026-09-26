import type { PoolClient } from "pg";
import { ErrorApi, codificarCursor, decodificarCursor } from "@xhub/core";
import { resolverRaiz } from "./personas.js";

export interface EntradaInteraccion {
  personaId: string;
  tipo: string;
  moduloOrigen: string;
  ocurrioEn?: Date | string;
  objetoTipo?: string;
  objetoId?: string;
  resumen?: string;
  meta?: Record<string, unknown>;
  /** id determinista para idempotencia (p.ej. el jobId del outbox). */
  dedupeId?: string;
}

export interface Interaccion {
  seq: string; id: string; tipo: string; ocurrio_en: string;
  modulo_origen: string; objeto_tipo: string | null; objeto_id: string | null;
  resumen: string | null; meta: unknown;
}

/** Registra una interacción. Idempotente por dedupeId: un reintento no duplica. */
export async function registrarInteraccion(c: PoolClient, e: EntradaInteraccion): Promise<Interaccion> {
  const persona = await resolverRaiz(c, e.personaId); // valida y sigue fusión
  const clienteId = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  const r = await c.query(
    `insert into nucleo.interacciones
       (cliente_id, persona_id, tipo, ocurrio_en, modulo_origen, objeto_tipo, objeto_id, resumen, meta, dedupe_id)
     values ($1,$2,$3,coalesce($4, now()),$5,$6,$7,$8,$9,$10)
     on conflict (cliente_id, dedupe_id) do nothing
     returning seq::text, id, tipo, ocurrio_en::text, modulo_origen, objeto_tipo, objeto_id, resumen, meta`,
    [clienteId, persona.id, e.tipo, e.ocurrioEn ?? null, e.moduloOrigen,
     e.objetoTipo ?? null, e.objetoId ?? null, e.resumen ?? null, JSON.stringify(e.meta ?? {}), e.dedupeId ?? null],
  );
  if (r.rowCount && r.rows[0]) return r.rows[0] as Interaccion;
  // ya existía (reintento): devolver la fila previa
  const prev = await c.query(
    `select seq::text, id, tipo, ocurrio_en::text, modulo_origen, objeto_tipo, objeto_id, resumen, meta
       from nucleo.interacciones where cliente_id=$1 and dedupe_id=$2`,
    [clienteId, e.dedupeId],
  );
  if (prev.rowCount && prev.rows[0]) return prev.rows[0] as Interaccion;
  throw new ErrorApi("INTERNO", "No se pudo registrar ni recuperar la interacción");
}

export interface PaginaTimeline { datos: Interaccion[]; siguiente: string | null; }

/** Línea de tiempo de una persona, keyset por seq DESC (estable, ley 4). */
export async function lineaDeTiempo(
  c: PoolClient, personaId: string, cursor?: string, limite = 50,
): Promise<PaginaTimeline> {
  const persona = await resolverRaiz(c, personaId);
  const desde = decodificarCursor(cursor);
  const r = await c.query(
    `select i.seq::text as seq, i.id, i.tipo, i.ocurrio_en::text as ocurrio_en, i.modulo_origen,
            i.objeto_tipo, i.objeto_id, i.resumen, i.meta
       from nucleo.interacciones i
      where i.persona_id=$1 ${desde ? "and i.seq < $3" : ""}
      order by i.seq desc limit $2`,
    desde ? [persona.id, limite + 1, desde] : [persona.id, limite + 1],
  );
  const filas = r.rows as Interaccion[];
  const hayMas = filas.length > limite;
  const datos = hayMas ? filas.slice(0, limite) : filas;
  const siguiente = hayMas ? codificarCursor(datos[datos.length - 1].seq) : null;
  return { datos, siguiente };
}
