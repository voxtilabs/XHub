import type { PoolClient } from "pg";
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { ErrorApi } from "@xhub/core";

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

export async function crearWebhook(c: PoolClient, url: string, eventos: string[]): Promise<{ id: string; secreto: string }> {
  const cid = await clienteDe(c);
  if (!/^https:\/\//.test(url)) throw new ErrorApi("VALIDACION", "La URL del webhook debe ser https");
  const secreto = "whsec_" + randomBytes(24).toString("base64url");
  const r = await c.query(
    "insert into plataforma.webhooks (cliente_id, url, eventos, secreto) values ($1,$2,$3,$4) returning id",
    [cid, url, eventos, secreto]);
  return { id: r.rows[0].id, secreto };
}

/** Rota el secreto (el anterior deja de valer). */
export async function rotarSecreto(c: PoolClient, id: string): Promise<string> {
  const secreto = "whsec_" + randomBytes(24).toString("base64url");
  await c.query("update plataforma.webhooks set secreto=$2 where id=$1", [id, secreto]);
  return secreto;
}

/**
 * Encola un evento hacia los webhooks del cliente suscritos. ENCOLA, no hace HTTP
 * (ley 7): un worker aparte lo entrega con reintentos.
 */
export async function encolarEvento(c: PoolClient, evento: string, payload: Record<string, unknown>): Promise<number> {
  const cid = await clienteDe(c);
  const subs = await c.query(
    "select id from plataforma.webhooks where cliente_id=$1 and activo=true and $2 = any(eventos)", [cid, evento]);
  for (const w of subs.rows)
    await c.query(
      "insert into plataforma.webhook_entregas (webhook_id, cliente_id, evento, payload) values ($1,$2,$3,$4)",
      [w.id, cid, evento, JSON.stringify(payload)]);
  return subs.rowCount ?? 0;
}

/** Firma estilo Stripe: t=<ts>,v1=<hmac(ts.payload)>. */
export function firmar(secreto: string, ts: number, cuerpo: string): string {
  const v1 = createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

/** Verifica una firma (para el lado del cliente y para tests). Ventana 300s. */
export function verificarFirma(secreto: string, cabecera: string, cuerpo: string, ahora: number): boolean {
  const partes = Object.fromEntries(cabecera.split(",").map((p) => p.split("=")));
  const ts = Number(partes.t);
  if (!ts || Math.abs(ahora - ts) > 300) return false;
  const esperado = createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex");
  return esperado === partes.v1;
}

/** Backoff exponencial: 1,2,4,8,16,32 min, tope 6 intentos. */
export function proximoIntento(intentos: number): number | null {
  if (intentos >= 6) return null; // se apaga
  return Math.pow(2, intentos) * 60; // segundos
}

// ── Entrega saliente (worker) ────────────────────────────────────────────────
// El POST se hace FUERA de transacción (ley 7). Como la URL la controla el
// cliente, hay que blindar SSRF: no dejar que el worker golpee loopback ni rangos
// internos (RFC1918, link-local, ULA, metadata 169.254.169.254).

/** ¿La IP cae en un rango que un webhook nunca debería poder alcanzar? */
export function esIpInterna(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 127 || p[0] === 10 || p[0] === 0) return true;         // loopback, 10/8, 0/8
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;          // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true;                      // 192.168/16
    if (p[0] === 169 && p[1] === 254) return true;                      // link-local + metadata
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;         // CGNAT 100.64/10
    if (p[0] >= 224) return true;                                       // multicast/reservado
    return false;
  }
  const l = ip.toLowerCase();
  if (l === "::1" || l === "::" || l === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  if (l.startsWith("fe80")) return true;                               // link-local
  if (l.startsWith("fc") || l.startsWith("fd")) return true;           // ULA fc00::/7
  const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);                   // IPv4-mapped
  if (m) return esIpInterna(m[1]);
  return false;
}

/** Valida que la URL de un webhook sea https y no apunte a un destino interno. */
export async function urlSegura(url: string): Promise<{ ok: boolean; motivo?: string }> {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, motivo: "URL inválida" }; }
  if (u.protocol !== "https:") return { ok: false, motivo: "debe ser https" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, motivo: "host local" };
  let ips: string[];
  try { ips = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address); }
  catch { return { ok: false, motivo: "el host no resuelve" }; }
  if (ips.length === 0) return { ok: false, motivo: "el host no resuelve" };
  for (const ip of ips) if (esIpInterna(ip)) return { ok: false, motivo: `destino interno (${ip})` };
  return { ok: true };
}

export interface ResumenEntrega { intentadas: number; entregadas: number; reprogramadas: number; fallidas: number; bloqueadas: number; }
type ConPlataforma = <T>(fn: (c: PoolClient) => Promise<T>) => Promise<T>;

/**
 * Entrega un lote de webhooks pendientes. Reclama el lote empujando `proxima_en`
 * (así un crash lo reintenta en vez de perderlo), hace el POST firmado FUERA de
 * transacción con timeout, y escribe el resultado en una tx aparte. Concurrente-
 * seguro por `for update skip locked`. Un webhook desactivado o con URL interna se
 * marca fallido sin reintentar.
 */
export async function entregarWebhooksPendientes(
  conPlataforma: ConPlataforma,
  opts: { limite?: number; fetchImpl?: typeof fetch; timeoutMs?: number; ahoraMs?: number } = {},
): Promise<ResumenEntrega> {
  const limite = opts.limite ?? 20;
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  type Fila = { id: string; evento: string; payload: unknown; intentos: number; url: string; secreto: string; activo: boolean };
  const lote = await conPlataforma(async (c) => (await c.query(
    `update plataforma.webhook_entregas e
        set proxima_en = now() + interval '60 seconds'
       from plataforma.webhooks w
      where w.id = e.webhook_id
        and e.id in (
          select id from plataforma.webhook_entregas
           where estado='pendiente' and proxima_en <= now()
           order by proxima_en asc
           limit ${limite} for update skip locked)
    returning e.id, e.evento, e.payload, e.intentos, w.url, w.secreto, w.activo`,
  )).rows as Fila[]);

  let entregadas = 0, reprogramadas = 0, fallidas = 0, bloqueadas = 0;
  for (const d of lote) {
    const cuerpo = JSON.stringify({ evento: d.evento, datos: d.payload });
    const ts = Math.floor((opts.ahoraMs ?? Date.now()) / 1000);
    const firma = firmar(d.secreto, ts, cuerpo);
    let codigo: number | null = null, ok = false, bloqueado = false, motivoBloqueo = "";

    if (!d.activo) { bloqueado = true; motivoBloqueo = "webhook desactivado"; }
    else {
      const g = await urlSegura(d.url);
      if (!g.ok) { bloqueado = true; motivoBloqueo = g.motivo ?? "URL rechazada"; }
      else {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const resp = await f(d.url, { method: "POST", body: cuerpo, signal: ctrl.signal,
            headers: { "content-type": "application/json", "x-xhub-firma": firma, "x-xhub-evento": d.evento } });
          codigo = resp.status; ok = resp.status >= 200 && resp.status < 300;
        } catch { ok = false; } finally { clearTimeout(t); }
      }
    }

    const prox = ok || bloqueado ? null : proximoIntento(d.intentos + 1);
    await conPlataforma(async (c) => {
      if (ok) await c.query("update plataforma.webhook_entregas set estado='entregado', intentos=intentos+1, ultimo_codigo=$2 where id=$1", [d.id, codigo]);
      else if (bloqueado || prox == null) await c.query("update plataforma.webhook_entregas set estado='fallido', intentos=intentos+1, ultimo_codigo=$2 where id=$1", [d.id, codigo]);
      else await c.query("update plataforma.webhook_entregas set intentos=intentos+1, ultimo_codigo=$2, proxima_en=now() + ($3 || ' seconds')::interval where id=$1", [d.id, codigo, prox]);
    });

    if (ok) entregadas++;
    else if (bloqueado) { bloqueadas++; void motivoBloqueo; }
    else if (prox == null) fallidas++;
    else reprogramadas++;
  }
  return { intentadas: lote.length, entregadas, reprogramadas, fallidas, bloqueadas };
}

/** Reintento manual desde el panel: reencola una entrega fallida (del propio cliente). */
export async function reintentarEntrega(c: PoolClient, id: string): Promise<boolean> {
  const cid = await clienteDe(c);
  const r = await c.query(
    "update plataforma.webhook_entregas set estado='pendiente', proxima_en=now() where id=$1 and cliente_id=$2 and estado='fallido' returning id",
    [id, cid]);
  return (r.rowCount ?? 0) > 0;
}

export interface EntregaListada { id: string; evento: string; url: string; estado: string; ultimo_codigo: number | null; intentos: number; proxima_en: string; creado_en: string; }

/** Lista las entregas del cliente, con filtro por estado y paginación por cursor (creado_en). */
export async function listarEntregas(c: PoolClient, opts: { estado?: string; limite?: number; cursor?: string } = {}): Promise<{ datos: EntregaListada[]; siguiente: string | null }> {
  const cid = await clienteDe(c);
  const params: unknown[] = [cid];
  let cond = "";
  if (opts.estado && ["pendiente", "entregado", "fallido"].includes(opts.estado)) { params.push(opts.estado); cond += ` and e.estado=$${params.length}`; }
  if (opts.cursor) { params.push(opts.cursor); cond += ` and e.creado_en < $${params.length}`; }
  const lim = Math.min(Math.max(opts.limite ?? 30, 1), 100);
  const { rows } = await c.query(
    `select e.id, e.evento, w.url, e.estado, e.ultimo_codigo, e.intentos, e.proxima_en, e.creado_en
       from plataforma.webhook_entregas e join plataforma.webhooks w on w.id = e.webhook_id
      where e.cliente_id=$1 ${cond}
      order by e.creado_en desc limit ${lim + 1}`, params);
  const datos = rows.slice(0, lim) as EntregaListada[];
  const siguiente = rows.length > lim ? (datos[datos.length - 1].creado_en as string) : null;
  return { datos, siguiente };
}
