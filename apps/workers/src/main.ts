import { despacharLote, cerrarPool, conPlataforma } from "@xhub/db";
import { fijarObservadorIA } from "@xhub/ia";
import { crearSinkUsoIA, entregarWebhooksPendientes } from "@xhub/modulo-nucleo";
import { construirRegistro } from "./registro.js";
import { tickSondeo, tickReconciliacion } from "./sondeo.js";

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

// El sondeo de XContact se evalúa cada SONDEO_TICK_MS (no en cada vuelta del bucle);
// tickSondeo solo toca las instancias cuyo intervalo ya venció, así que es barato.
// Vacío ("" de `${VAR:-}` en compose) no es undefined: Number("")=0 dispararía el
// sondeo en cada vuelta. Tratamos vacío/no-positivo como ausente.
const nTick = Number(process.env.SONDEO_TICK_MS);
const SONDEO_TICK_MS = Number.isFinite(nTick) && nTick > 0 ? nTick : 10000;
let proximoSondeo = 0;
// La reconciliación (barrido completo) corre mucho menos seguido que el sondeo.
const nRecon = Number(process.env.RECON_TICK_MS);
const RECON_TICK_MS = Number.isFinite(nRecon) && nRecon > 0 ? nRecon : 300000; // 5 min: mira si alguna venció
let proximoRecon = 0;

async function bucle(): Promise<void> {
  process.stdout.write(`[xhub-workers] despachando outbox · ${registro.length} consumidores\n`);
  while (vivo) {
    try {
      const r = await despacharLote(registro, { limite: 50, maxIntentos: 5 });
      if (r.procesados || r.fallidos || r.sinConsumidor)
        process.stdout.write(`[xhub-workers] leidos=${r.leidos} ok=${r.procesados} fallidos=${r.fallidos} sin-consumidor=${r.sinConsumidor}\n`);
      // Entrega de webhooks salientes: el POST va FUERA de transacción (ley 7).
      const w = await entregarWebhooksPendientes(conPlataforma, { limite: 20 });
      if (w.intentadas)
        process.stdout.write(`[xhub-workers] webhooks intentadas=${w.intentadas} ok=${w.entregadas} reprog=${w.reprogramadas} fallidas=${w.fallidas} bloqueadas=${w.bloqueadas}\n`);
      // Sondeo incremental de XContact (throttled). Aislado por instancia (#136).
      if (Date.now() >= proximoSondeo) {
        proximoSondeo = Date.now() + SONDEO_TICK_MS;
        const s = await tickSondeo().catch((e) => { process.stderr.write(`[sondeo] tick error: ${(e as Error).message}\n`); return null; });
        if (s && s.debidas)
          process.stdout.write(`[xhub-workers] sondeo debidas=${s.debidas} ok=${s.sincronizadas} contactos=${s.contactos} fallidas=${s.fallidas}\n`);
      }
      // Reconciliación (barrido completo, baja frecuencia): compara conteos y repara deriva.
      if (Date.now() >= proximoRecon) {
        proximoRecon = Date.now() + RECON_TICK_MS;
        const rc = await tickReconciliacion().catch((e) => { process.stderr.write(`[recon] tick error: ${(e as Error).message}\n`); return null; });
        if (rc && rc.debidas)
          process.stdout.write(`[xhub-workers] recon debidas=${rc.debidas} conDeriva=${rc.conDeriva} reparadas=${rc.reparadas} fallidas=${rc.fallidas}\n`);
      }
      await dormir(r.leidos > 0 || w.intentadas > 0 ? 150 : ESPERA_VACIO);
    } catch (e) {
      process.stderr.write(`[xhub-workers] error de lote: ${(e as Error).message}\n`);
      await dormir(ESPERA_VACIO);
    }
  }
}

for (const s of ["SIGTERM", "SIGINT"] as const)
  process.on(s, () => { vivo = false; cerrarPool().finally(() => process.exit(0)); });

bucle().catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
