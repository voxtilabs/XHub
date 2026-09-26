import type { PoolClient } from "pg";
import { createHmac, randomBytes } from "node:crypto";
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
