import type { PoolClient } from "pg";
import { conPlataforma, clienteActual } from "@xhub/db";

/**
 * Consumo de IA: qué hizo la IA y cuánto costó (tokens, latencia, proveedor). El
 * observador de @xhub/ia emite un registro por llamada; aquí lo persistimos,
 * atribuyéndolo al cliente del contexto actual (si lo hay). Así el superadmin ve la
 * actividad de IA de la plataforma y por cliente, sin acoplar @xhub/ia a la base.
 */
export interface RegistroUsoIA {
  tarea: string; proveedor: string; modelo: string;
  tokensPrompt: number; tokensSalida: number; ms: number; ok: boolean;
}

export async function registrarUsoIA(c: PoolClient, clienteId: string | null, u: RegistroUsoIA): Promise<void> {
  await c.query(
    `insert into plataforma.ia_uso (cliente_id, tarea, proveedor, modelo, tokens_prompt, tokens_salida, ms, ok)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [clienteId, u.tarea, u.proveedor, u.modelo, u.tokensPrompt, u.tokensSalida, u.ms, u.ok]);
}

/** Sink para fijarObservadorIA: escribe cada llamada. Fire-and-forget — nunca bloquea la IA. */
export function crearSinkUsoIA(): (u: RegistroUsoIA) => void {
  return (u) => {
    const cid = clienteActual();
    void conPlataforma((c) => registrarUsoIA(c, cid, u)).catch(() => { /* la observabilidad nunca rompe */ });
  };
}

export interface ResumenUsoIA {
  total: number; ok: number; fallidos: number;
  tokensPrompt: number; tokensSalida: number; msPromedio: number;
  porTarea: { tarea: string; llamadas: number; tokens: number }[];
  porProveedor: { proveedor: string; modelo: string; llamadas: number; tokens: number }[];
  recientes: { tarea: string; proveedor: string; modelo: string; tokens: number; ms: number; ok: boolean; creadoEn: string; clienteId: string | null }[];
}

/** Resumen del consumo de IA (global, o de un cliente) en los últimos `dias`. */
export async function resumenUsoIA(c: PoolClient, opts: { clienteId?: string; dias?: number } = {}): Promise<ResumenUsoIA> {
  const dias = opts.dias ?? 30;
  const filtro = opts.clienteId ? "and cliente_id = $2" : "";
  const p = opts.clienteId ? [dias, opts.clienteId] : [dias];
  const ventana = "creado_en > now() - make_interval(days => $1)";
  const tot = await c.query(
    `select count(*)::int total, count(*) filter (where ok)::int ok,
       coalesce(sum(tokens_prompt),0)::int tp, coalesce(sum(tokens_salida),0)::int ts,
       coalesce(round(avg(ms)),0)::int msp
     from plataforma.ia_uso where ${ventana} ${filtro}`, p);
  const tarea = await c.query(
    `select tarea, count(*)::int llamadas, coalesce(sum(tokens_prompt+tokens_salida),0)::int tokens
     from plataforma.ia_uso where ${ventana} ${filtro} group by tarea order by llamadas desc`, p);
  const prov = await c.query(
    `select proveedor, modelo, count(*)::int llamadas, coalesce(sum(tokens_prompt+tokens_salida),0)::int tokens
     from plataforma.ia_uso where ${ventana} ${filtro} group by proveedor, modelo order by llamadas desc`, p);
  const rec = await c.query(
    `select tarea, proveedor, modelo, (tokens_prompt+tokens_salida)::int tokens, ms, ok, creado_en, cliente_id
     from plataforma.ia_uso where ${ventana} ${filtro} order by creado_en desc limit 20`, p);
  const t = tot.rows[0];
  return {
    total: t.total, ok: t.ok, fallidos: t.total - t.ok, tokensPrompt: t.tp, tokensSalida: t.ts, msPromedio: t.msp,
    porTarea: tarea.rows.map((x) => ({ tarea: x.tarea, llamadas: x.llamadas, tokens: x.tokens })),
    porProveedor: prov.rows.map((x) => ({ proveedor: x.proveedor, modelo: x.modelo, llamadas: x.llamadas, tokens: x.tokens })),
    recientes: rec.rows.map((x) => ({ tarea: x.tarea, proveedor: x.proveedor, modelo: x.modelo, tokens: x.tokens, ms: x.ms, ok: x.ok, creadoEn: x.creado_en, clienteId: x.cliente_id })),
  };
}
