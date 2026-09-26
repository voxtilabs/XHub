import type { PoolClient } from "pg";
import { conPlataforma, conCliente } from "./pool.js";
import { marcarParaConsumidor, marcarProcesado, marcarError } from "./outbox.js";

/**
 * Despachador del outbox. Cierra el bucle event-driven (ADR 0002/0005): lee los
 * eventos pendientes de nucleo.outbox y entrega cada uno a los consumidores suscritos
 * a su `tipo`. No conoce a ningún módulo — el registro de consumidores se INYECTA.
 *
 * Exactamente-una-vez por consumidor: `marcarParaConsumidor` (INSERT ON CONFLICT en
 * nucleo.eventos_procesados) y el efecto del consumidor corren en LA MISMA transacción
 * (conCliente). Si el consumidor falla, se revierte también la marca → se reintenta.
 * Por eso pueden correr varios despachadores en paralelo sin pisarse.
 */
export interface EventoDespacho {
  id: string;
  clienteId: string | null;
  modulo: string;
  tipo: string;
  payload: Record<string, unknown>;
  intentos: number;
}

export interface ConsumidorEvento {
  tipo: string;
  consumidor: string; // id estable, p.ej. "tickets:supresion-persona"
  manejar(c: PoolClient, ev: EventoDespacho): Promise<unknown>;
}

export interface ResumenDespacho { leidos: number; procesados: number; fallidos: number; sinConsumidor: number; }

export interface OpcionesDespacho {
  limite?: number;         // eventos por lote
  maxIntentos?: number;    // tras esto, el evento queda en la cola de muertos (no se reintenta)
  modulosActivos?: string[]; // si se da, solo procesa eventos emitidos por estos módulos
}

/** Procesa UN lote de pendientes. Devuelve el conteo. Idempotente y concurrente-seguro. */
export async function despacharLote(registro: ConsumidorEvento[], opts: OpcionesDespacho = {}): Promise<ResumenDespacho> {
  const limite = opts.limite ?? 50;
  const maxIntentos = opts.maxIntentos ?? 5;
  const porTipo = new Map<string, ConsumidorEvento[]>();
  for (const c of registro) {
    if (!porTipo.has(c.tipo)) porTipo.set(c.tipo, []);
    porTipo.get(c.tipo)!.push(c);
  }

  // 1) Leer el lote como dueño (outbox no tiene RLS). SKIP LOCKED evita que dos
  //    despachadores lean las mismas filas; la seguridad real la da eventos_procesados.
  const filas = await conPlataforma(async (c) => {
    const params: unknown[] = [maxIntentos];
    let cond = "";
    if (opts.modulosActivos?.length) { params.push(opts.modulosActivos); cond = "and modulo = any($2)"; }
    const { rows } = await c.query(
      `select id, cliente_id as "clienteId", modulo, tipo, payload, intentos
         from nucleo.outbox
        where procesado_en is null and intentos < $1 ${cond}
        order by creado_en asc
        limit ${limite} for update skip locked`,
      params,
    );
    return rows as EventoDespacho[];
  });

  let procesados = 0, fallidos = 0, sinConsumidor = 0;
  for (const ev of filas) {
    const cons = porTipo.get(ev.tipo) ?? [];
    if (cons.length === 0) {
      // Nadie escucha este tipo: se marca procesado para no releerlo siempre.
      await conPlataforma((c) => marcarProcesado(c, ev.id));
      sinConsumidor++;
      continue;
    }
    let ok = true;
    for (const co of cons) {
      try {
        if (ev.clienteId == null) throw new Error("evento con consumidor pero sin cliente_id");
        await conCliente(ev.clienteId, async (c) => {
          const primera = await marcarParaConsumidor(c, ev.id, co.consumidor);
          if (primera) await co.manejar(c, ev); // marca + efecto, atómicos
        });
      } catch (e) {
        ok = false;
        await conPlataforma((c) => marcarError(c, ev.id, `${co.consumidor}: ${(e as Error).message}`));
        break; // no seguimos con los demás consumidores de este evento en esta pasada
      }
    }
    if (ok) { await conPlataforma((c) => marcarProcesado(c, ev.id)); procesados++; }
    else fallidos++;
  }
  return { leidos: filas.length, procesados, fallidos, sinConsumidor };
}

/** Cola de muertos: eventos que agotaron los reintentos. Para inspección/panel. */
export async function listarMuertos(maxIntentos = 5, limite = 100): Promise<EventoDespacho[]> {
  return conPlataforma(async (c) => {
    const { rows } = await c.query(
      `select id, cliente_id as "clienteId", modulo, tipo, payload, intentos
         from nucleo.outbox
        where procesado_en is null and intentos >= $1
        order by creado_en asc limit $2`,
      [maxIntentos, limite],
    );
    return rows as EventoDespacho[];
  });
}
