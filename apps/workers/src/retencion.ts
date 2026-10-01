import { purgarRetencion, type ResumenRetencion } from "@xhub/modulo-nucleo";

/**
 * Programación del barrido de retención (#105). La lógica vive en @xhub/modulo-nucleo
 * (la comparten api y workers); aquí solo decidimos cada cuánto corre. Muy baja
 * frecuencia: una vez al día basta para una retención por días.
 */
const nTick = Number(process.env.RETENCION_TICK_MS);
const RETENCION_TICK_MS = Number.isFinite(nTick) && nTick > 0 ? nTick : 86400000; // 24 h
let proximo = 0;

export function retencionDebida(): boolean { return Date.now() >= proximo; }
export async function tickRetencion(): Promise<ResumenRetencion | null> {
  proximo = Date.now() + RETENCION_TICK_MS;
  return purgarRetencion();
}
