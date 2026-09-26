import Redis from "ioredis";
import { ErrorApi } from "@xhub/core";

let _redis: Redis | null = null;
function redis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL no está definida");
    _redis = new Redis(url);
  }
  return _redis;
}
export async function cerrarRedis(): Promise<void> { if (_redis) { await _redis.quit(); _redis = null; } }

/** El mes de negocio en America/Santiago, como texto AAAA-MM (ley 3). */
export function mesNegocio(ahora = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" });
  return f.format(ahora); // "2026-09"
}

export interface ResultadoLimite { permitido: boolean; restante: number; limite: number; }

/**
 * Rate limit por minuto (ráfaga) en Redis. Ventana fija por minuto.
 * Devuelve si se permite y cuánto queda. No lanza: el llamador decide.
 */
export async function rateLimit(llaveId: string, porMinuto: number, ahora = new Date()): Promise<ResultadoLimite> {
  const minuto = Math.floor(ahora.getTime() / 60000);
  const k = `rl:${llaveId}:${minuto}`;
  const n = await redis().incr(k);
  if (n === 1) await redis().expire(k, 120);
  return { permitido: n <= porMinuto, restante: Math.max(0, porMinuto - n), limite: porMinuto };
}

/**
 * Cuota mensual por cliente. Consume 1 y devuelve el estado. El mes es el de negocio.
 * Avisos al 80% y 100% se disparan una sola vez por periodo (SETNX del hito).
 */
export interface ResultadoCuota extends ResultadoLimite { aviso: null | "ochenta" | "cien"; }
export async function consumirCuota(clienteId: string, limiteMensual: number, ahora = new Date()): Promise<ResultadoCuota> {
  const mes = mesNegocio(ahora);
  const k = `cuota:${clienteId}:${mes}`;
  const usado = await redis().incr(k);
  if (usado === 1) await redis().expire(k, 60 * 60 * 24 * 40); // ~40 días, cubre el mes
  const restante = Math.max(0, limiteMensual - usado);
  let aviso: ResultadoCuota["aviso"] = null;
  const pct = usado / limiteMensual;
  if (usado >= limiteMensual && await hito(clienteId, mes, "cien")) aviso = "cien";
  else if (pct >= 0.8 && await hito(clienteId, mes, "ochenta")) aviso = "ochenta";
  return { permitido: usado <= limiteMensual, restante, limite: limiteMensual, aviso };
}

/** Marca un hito una sola vez (SETNX). Devuelve true si es la primera vez. */
async function hito(clienteId: string, mes: string, cual: string): Promise<boolean> {
  const r = await redis().set(`hito:${clienteId}:${mes}:${cual}`, "1", "EX", 60 * 60 * 24 * 40, "NX");
  return r === "OK";
}

/** Uso actual del mes (sin consumir). */
export async function usoDelMes(clienteId: string, ahora = new Date()): Promise<number> {
  const v = await redis().get(`cuota:${clienteId}:${mesNegocio(ahora)}`);
  return v ? Number(v) : 0;
}

/** Exige cuota o lanza 429 con código estable. Para el guard de la API. */
export async function exigirCuota(clienteId: string, limiteMensual: number): Promise<ResultadoCuota> {
  const r = await consumirCuota(clienteId, limiteMensual);
  if (!r.permitido) throw new ErrorApi("CUOTA_EXCEDIDA", "Cuota mensual de API agotada", { restante: 0 });
  return r;
}
