import { conCliente, conPlataforma, auditar } from "@xhub/db";
import { resolverCredencial } from "@xhub/core";
import {
  reconciliarPersona, registrarInteraccion,
  asegurarEtiqueta, aplicarEtiqueta, asegurarCampo, ponerValor,
} from "@xhub/modulo-nucleo";
import { sincronizarContactosInstancia, reconciliarContactosInstancia, type NucleoContactos, type DepsSondeo } from "@xhub/modulo-conector";
import { fetchXContact } from "./fetch-xcontact.js";

/**
 * Scheduler de SONDEO incremental (#59) con aislamiento por instancia (#136).
 *
 * Cada tick toma las instancias con `sondeo_activo` cuyo intervalo ya venció, y las
 * sincroniza de a poco (cursor por instancia). El aislamiento es la clave: una instancia
 * lenta o caída ocupa SOLO su propio cupo (timeout + try/catch por instancia, corridas en
 * lotes de concurrencia acotada), así nunca frena la sincronización de las demás.
 */
const nucleoContactos: NucleoContactos = {
  reconciliarPersona: (c, ids, nombre) => reconciliarPersona(c, ids as never, nombre),
  registrarInteraccion: (c, e) => registrarInteraccion(c, e as never),
  asegurarEtiqueta: (c, n) => asegurarEtiqueta(c, n),
  aplicarEtiqueta: (c, p, e) => aplicarEtiqueta(c, p, e),
  asegurarCampo: (c, o, n, t) => asegurarCampo(c, o, n, t as never),
  ponerValor: (c, o, id, campo, v) => ponerValor(c, o, id, campo, v),
  repuntarObjetos: async (c, viejo, nuevo) => {
    await c.query("update tickets set persona_id=$1 where persona_id=$2", [nuevo, viejo]);
    await c.query("update crm_oportunidades set persona_id=$1 where persona_id=$2", [nuevo, viejo]);
    await c.query("update crm_leads set persona_id=$1 where persona_id=$2", [nuevo, viejo]);
  },
  contarImportados: async (c, host) => Number((await c.query(
    "select count(*)::int n from nucleo.interacciones where tipo='contacto.importado' and dedupe_id like $1", [`xc:${host}:%`])).rows[0].n),
};
const deps: DepsSondeo = { conCliente, conPlataforma, fetchImpl: fetchXContact, nucleo: nucleoContactos };

interface FilaInstancia { id: string; cliente_id: string; host: string; usuario: string; credencial_ref: string | null; credencial_cifrada: string | null; cursor: string | null }
export interface ResumenTick { debidas: number; sincronizadas: number; contactos: number; fallidas: number }

// process.env vacío ("" de `${VAR:-}` en compose) NO es undefined: Number("")=0 haría
// un `i += 0` infinito y colgaría al worker. Tratamos vacío/no-positivo como ausente.
const numEnv = (v: string | undefined, def: number): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : def; };
const CONCURRENCIA = numEnv(process.env.SONDEO_CONCURRENCIA, 4);
const LOTE_INSTANCIA = numEnv(process.env.SONDEO_LOTE, 100);   // contactos por corrida/instancia
const TIMEOUT_MS = numEnv(process.env.SONDEO_TIMEOUT_MS, 30000);
const BREAKER_UMBRAL = numEnv(process.env.SONDEO_BREAKER_UMBRAL, 5);      // fallos antes de abrir
const BREAKER_COOLDOWN_SEG = numEnv(process.env.SONDEO_BREAKER_COOLDOWN, 300); // enfriamiento (prueba de reapertura)

const conTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout de sondeo de instancia")), ms))]);

/** Traduce el error a una causa legible en español para el tablero (#66). */
function causaLegible(m: string): string {
  if (/timeout/i.test(m)) return "La instancia no respondió a tiempo (timeout).";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return "El host de la instancia no resuelve (DNS).";
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|socket/i.test(m)) return "No se pudo conectar con la instancia (red).";
  if (/40[13]|auth|supervisor|token/i.test(m)) return "Credenciales rechazadas por XContact.";
  if (/5\d\d/.test(m)) return "XContact respondió con un error de servidor.";
  if (/certificate|TLS|SSL/i.test(m)) return "Problema con el certificado TLS de la instancia.";
  return `Fallo del sondeo: ${m.slice(0, 120)}`;
}

async function sondearUna(f: FilaInstancia): Promise<{ ok: boolean; contactos: number }> {
  let clave = "", fuente = "ninguna";
  try { const r = resolverCredencial(f); clave = r.clave; fuente = r.fuente; } catch { /* sobre inabrible: se trata como sin credencial */ }
  if (fuente === "cifrada") await auditar({ clienteId: f.cliente_id, actorTipo: "sistema", accion: "credencial.descifrada", recurso: "instancia", recursoId: f.id, resultado: "ok", metadata: { operacion: "sondeo" } }).catch(() => {});
  if (!f.usuario || !clave) {
    // Sin credencial no se puede sondear: degradada con causa, pero NO frena a las demás.
    await conPlataforma((c) => c.query(
      "update plataforma.instancias_xcontact set estado_salud='degradada', ultimo_sondeo=now() where id=$1", [f.id]))
      .catch(() => {});
    return { ok: false, contactos: 0 };
  }
  try {
    const r = await conTimeout(sincronizarContactosInstancia(
      deps, { id: f.id, clienteId: f.cliente_id, host: f.host, usuario: f.usuario, clave },
      { limite: LOTE_INSTANCIA, desde: f.cursor }), TIMEOUT_MS);
    return { ok: true, contactos: r.leidos };
  } catch (e) {
    // Fallo aislado: cuenta el fallo y, si pasa el umbral, ABRE el cortacircuitos (#53):
    // marca degradada + corte_hasta, y la due-query dejará de llamarla hasta que expire.
    await conPlataforma((c) => c.query(
      `update plataforma.instancias_xcontact
          set fallos_consecutivos = fallos_consecutivos + 1,
              corte_hasta = case when fallos_consecutivos + 1 >= $2 then now() + ($3 || ' seconds')::interval else corte_hasta end,
              estado_salud = case when fallos_consecutivos + 1 >= $2 then 'degradada' else 'caida' end,
              ultima_causa = $4, ultimo_sondeo = now()
        where id=$1`, [f.id, BREAKER_UMBRAL, BREAKER_COOLDOWN_SEG, causaLegible((e as Error).message)]))
      .catch(() => {});
    process.stderr.write(`[sondeo] instancia ${f.id} falló: ${(e as Error).message}\n`);
    return { ok: false, contactos: 0 };
  }
}

/** Un tick: sincroniza las instancias cuyo intervalo venció. Concurrencia acotada + aislamiento. */
export async function tickSondeo(): Promise<ResumenTick> {
  const debidas = await conPlataforma(async (c) => (await c.query(
    `select i.id, i.cliente_id, i.host, i.usuario, i.credencial_ref, i.credencial_cifrada, sc.cursor
       from plataforma.instancias_xcontact i
       left join plataforma.sync_cursor sc on sc.instancia_id = i.id and sc.tipo='contactos'
      where i.sondeo_activo = true and i.cliente_id is not null
        and (i.corte_hasta is null or i.corte_hasta <= now())  -- breaker abierto → no la llames (#53)
        and (i.ultimo_sondeo is null or i.ultimo_sondeo < now() - (i.intervalo_sondeo_seg || ' seconds')::interval)
      order by i.ultimo_sondeo asc nulls first
      limit 50`)).rows as FilaInstancia[]);
  if (debidas.length === 0) return { debidas: 0, sincronizadas: 0, contactos: 0, fallidas: 0 };

  let sincronizadas = 0, contactos = 0, fallidas = 0;
  // Lotes de concurrencia acotada: una instancia enferma ocupa solo su cupo (#136).
  const paso = Math.max(1, CONCURRENCIA); // nunca 0 (evita bucle infinito)
  for (let i = 0; i < debidas.length; i += paso) {
    const lote = debidas.slice(i, i + paso);
    const res = await Promise.allSettled(lote.map(sondearUna));
    for (const x of res) {
      if (x.status === "fulfilled" && x.value.ok) { sincronizadas++; contactos += x.value.contactos; }
      else fallidas++;
    }
  }
  return { debidas: debidas.length, sincronizadas, contactos, fallidas };
}

// ── Reconciliación de baja frecuencia (#61) ──────────────────────────────────
const RECON_INTERVAL_SEG = numEnv(process.env.RECON_INTERVAL_SEG, 21600); // 6h por defecto
export interface ResumenRecon { debidas: number; conDeriva: number; reparadas: number; fallidas: number }

async function reconUna(f: FilaInstancia): Promise<{ ok: boolean; deriva: number }> {
  let clave = ""; try { clave = resolverCredencial(f).clave; } catch { /* sobre inabrible */ }
  if (!f.usuario || !clave) return { ok: false, deriva: 0 };
  try {
    const r = await conTimeout(reconciliarContactosInstancia(
      deps, { id: f.id, clienteId: f.cliente_id, host: f.host, usuario: f.usuario, clave }), TIMEOUT_MS * 3);
    return { ok: true, deriva: r.deriva };
  } catch (e) {
    process.stderr.write(`[recon] instancia ${f.id} falló: ${(e as Error).message}\n`);
    return { ok: false, deriva: 0 };
  }
}

/** Un tick de reconciliación: barre las instancias con sondeo activo cuya última
 *  reconciliación es vieja. Aislada por instancia igual que el sondeo. */
export async function tickReconciliacion(): Promise<ResumenRecon> {
  const debidas = await conPlataforma(async (c) => (await c.query(
    `select i.id, i.cliente_id, i.host, i.usuario, i.credencial_ref, i.credencial_cifrada, null::text as cursor
       from plataforma.instancias_xcontact i
       left join plataforma.sync_deriva sd on sd.instancia_id = i.id and sd.tipo='contactos'
      where i.sondeo_activo = true and i.cliente_id is not null
        and (sd.detectada_en is null or sd.detectada_en < now() - ($1 || ' seconds')::interval)
      order by sd.detectada_en asc nulls first
      limit 20`, [RECON_INTERVAL_SEG])).rows as FilaInstancia[]);
  if (debidas.length === 0) return { debidas: 0, conDeriva: 0, reparadas: 0, fallidas: 0 };
  let conDeriva = 0, reparadas = 0, fallidas = 0;
  const paso = Math.max(1, CONCURRENCIA);
  for (let i = 0; i < debidas.length; i += paso) {
    const res = await Promise.allSettled(debidas.slice(i, i + paso).map(reconUna));
    for (const x of res) {
      if (x.status === "fulfilled" && x.value.ok) { if (x.value.deriva > 0) { conDeriva++; reparadas++; } }
      else fallidas++;
    }
  }
  return { debidas: debidas.length, conDeriva, reparadas, fallidas };
}
