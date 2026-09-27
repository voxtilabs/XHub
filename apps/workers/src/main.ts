import { despacharLote, cerrarPool } from "@xhub/db";
import { fijarObservadorIA } from "@xhub/ia";
import { crearSinkUsoIA } from "@xhub/modulo-nucleo";
import { construirRegistro } from "./registro.js";

// El triage con IA corre aquí (consumidores del outbox): registra su consumo.
fijarObservadorIA(crearSinkUsoIA());

/**
 * Proceso workers: despacha el outbox en bucle. Cuando no hay pendientes, espera más;
 * cuando trabajó, vuelve enseguida (drena ráfagas rápido). Es idempotente y se puede
 * correr en varias réplicas: eventos_procesados garantiza entrega única por consumidor.
 */
const registro = construirRegistro();
const ESPERA_VACIO = Number(process.env.WORKERS_ESPERA_MS ?? 2000);
let vivo = true;

async function dormir(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function bucle(): Promise<void> {
  process.stdout.write(`[xhub-workers] despachando outbox · ${registro.length} consumidores\n`);
  while (vivo) {
    try {
      const r = await despacharLote(registro, { limite: 50, maxIntentos: 5 });
      if (r.procesados || r.fallidos || r.sinConsumidor)
        process.stdout.write(`[xhub-workers] leidos=${r.leidos} ok=${r.procesados} fallidos=${r.fallidos} sin-consumidor=${r.sinConsumidor}\n`);
      await dormir(r.leidos > 0 ? 150 : ESPERA_VACIO);
    } catch (e) {
      process.stderr.write(`[xhub-workers] error de lote: ${(e as Error).message}\n`);
      await dormir(ESPERA_VACIO);
    }
  }
}

for (const s of ["SIGTERM", "SIGINT"] as const)
  process.on(s, () => { vivo = false; cerrarPool().finally(() => process.exit(0)); });

bucle().catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
