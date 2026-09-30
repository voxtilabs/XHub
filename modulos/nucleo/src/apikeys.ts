import type { PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { ErrorApi } from "@xhub/core";

export interface LlaveCreada { id: string; token: string; prefijo: string; }

function hashToken(t: string): string { return createHash("sha256").update(t).digest("hex"); }

/**
 * Crea una llave. Devuelve el token en claro UNA vez; en la base solo el hash.
 * Los scopes son un techo: no pueden exceder los entitlements (se valida al usar).
 */
export async function crearLlave(c: PoolClient, clienteId: string, nombre: string, scopes: string[] = []): Promise<LlaveCreada> {
  const token = "xhub_" + randomBytes(24).toString("base64url");
  const prefijo = token.slice(0, 12);
  const r = await c.query(
    `insert into plataforma.api_keys (cliente_id, nombre, hash, prefijo, scopes)
       values ($1,$2,$3,$4,$5) returning id`,
    [clienteId, nombre, hashToken(token), prefijo, scopes]);
  return { id: r.rows[0].id, token, prefijo };
}

export interface LlaveResuelta { id: string; clienteId: string; scopes: string[]; }

/**
 * Resuelve una llave a su cliente. EL CLIENTE SALE DE LA LLAVE, nunca de un header
 * → cruzar clientes es imposible por construcción. Actualiza último_uso (throttled).
 */
export async function resolverLlave(c: PoolClient, token: string): Promise<LlaveResuelta> {
  if (!token?.startsWith("xhub_")) throw new ErrorApi("NO_AUTENTICADO", "Llave de API inválida");
  const r = await c.query(
    `select id, cliente_id, scopes from plataforma.api_keys
       where hash=$1 and revocada_en is null`, [hashToken(token)]);
  if (r.rowCount === 0) throw new ErrorApi("NO_AUTENTICADO", "Llave de API inválida o revocada");
  const fila = r.rows[0];
  // último uso, sin escribir en cada request (throttle 1 min)
  await c.query(
    "update plataforma.api_keys set ultimo_uso=now() where id=$1 and (ultimo_uso is null or ultimo_uso < now() - interval '1 minute')",
    [fila.id]);
  return { id: fila.id, clienteId: fila.cliente_id, scopes: fila.scopes };
}

export async function revocarLlave(c: PoolClient, id: string): Promise<void> {
  await c.query("update plataforma.api_keys set revocada_en=now() where id=$1 and revocada_en is null", [id]);
}

export interface LlaveListada {
  id: string; nombre: string; prefijo: string; scopes: string[];
  creada_en: string; ultimo_uso: string | null; revocada_en: string | null;
}

/** Lista las llaves de un cliente (el token nunca se muestra, solo el prefijo). */
export async function listarLlaves(c: PoolClient, clienteId: string): Promise<LlaveListada[]> {
  const r = await c.query(
    `select id, nombre, prefijo, scopes,
            creada_en::text as creada_en, ultimo_uso::text as ultimo_uso, revocada_en::text as revocada_en
       from plataforma.api_keys where cliente_id=$1 order by revocada_en nulls first, creada_en desc`, [clienteId]);
  return r.rows as LlaveListada[];
}

/** Reemplaza los scopes de una llave (acotado al cliente, no cruza clientes). */
export async function actualizarScopesLlave(c: PoolClient, clienteId: string, id: string, scopes: string[]): Promise<LlaveListada | null> {
  const r = await c.query(
    `update plataforma.api_keys set scopes=$3 where id=$1 and cliente_id=$2 and revocada_en is null
       returning id, nombre, prefijo, scopes, creada_en::text as creada_en, ultimo_uso::text as ultimo_uso, revocada_en::text as revocada_en`,
    [id, clienteId, scopes]);
  return (r.rows[0] as LlaveListada) ?? null;
}
