import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { resolverRaiz } from "./personas.js";

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

export type ColorRol = "accion" | "senal" | "exito" | "neutro";
export interface Etiqueta { id: string; nombre: string; color_rol: ColorRol; }

export async function crearEtiqueta(c: PoolClient, nombre: string, colorRol: ColorRol = "neutro"): Promise<Etiqueta> {
  const cid = await clienteDe(c);
  if (!nombre.trim()) throw new ErrorApi("VALIDACION", "El nombre de la etiqueta es obligatorio");
  try {
    const r = await c.query(
      "insert into nucleo.etiquetas (cliente_id, nombre, color_rol) values ($1,$2,$3) returning id, nombre, color_rol",
      [cid, nombre.trim(), colorRol]);
    return r.rows[0];
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new ErrorApi("CONFLICTO", "Ya existe una etiqueta con ese nombre", { nombre });
    throw e;
  }
}

/** Get-or-create de una etiqueta por nombre (idempotente, para la ingesta). */
export async function asegurarEtiqueta(c: PoolClient, nombre: string, colorRol: ColorRol = "neutro"): Promise<string> {
  const cid = await clienteDe(c);
  const n = nombre.trim();
  const ex = await c.query("select id from nucleo.etiquetas where cliente_id=$1 and nombre=$2", [cid, n]);
  if (ex.rowCount) return ex.rows[0].id;
  const r = await c.query("insert into nucleo.etiquetas (cliente_id, nombre, color_rol) values ($1,$2,$3) returning id", [cid, n, colorRol]);
  return r.rows[0].id;
}

export async function aplicarEtiqueta(c: PoolClient, personaId: string, etiquetaId: string): Promise<void> {
  const cid = await clienteDe(c);
  const p = await resolverRaiz(c, personaId);
  await c.query(
    "insert into nucleo.persona_etiquetas (cliente_id, persona_id, etiqueta_id) values ($1,$2,$3) on conflict do nothing",
    [cid, p.id, etiquetaId]);
}

/** Personas con una etiqueta, paginado keyset por seq de identidad (estable). */
export async function personasConEtiqueta(c: PoolClient, etiquetaId: string, limite = 50): Promise<string[]> {
  const cid = await clienteDe(c);
  const r = await c.query(
    "select persona_id from nucleo.persona_etiquetas where cliente_id=$1 and etiqueta_id=$2 limit $3",
    [cid, etiquetaId, limite]);
  return r.rows.map((x) => x.persona_id as string);
}

export type TipoCampo = "texto" | "numero" | "fecha" | "bool";
export async function definirCampo(c: PoolClient, objetoTipo: string, nombre: string, tipo: TipoCampo): Promise<string> {
  const cid = await clienteDe(c);
  const r = await c.query(
    "insert into nucleo.campos_def (cliente_id, objeto_tipo, nombre, tipo) values ($1,$2,$3,$4) returning id",
    [cid, objetoTipo, nombre.trim(), tipo]);
  return r.rows[0].id;
}

/** Get-or-create de una definición de campo por (objetoTipo, nombre). Idempotente. */
export async function asegurarCampo(c: PoolClient, objetoTipo: string, nombre: string, tipo: TipoCampo): Promise<string> {
  const cid = await clienteDe(c);
  const n = nombre.trim();
  const ex = await c.query("select id from nucleo.campos_def where cliente_id=$1 and objeto_tipo=$2 and nombre=$3", [cid, objetoTipo, n]);
  if (ex.rowCount) return ex.rows[0].id;
  const r = await c.query("insert into nucleo.campos_def (cliente_id, objeto_tipo, nombre, tipo) values ($1,$2,$3,$4) returning id", [cid, objetoTipo, n, tipo]);
  return r.rows[0].id;
}

export async function ponerValor(c: PoolClient, objetoTipo: string, objetoId: string, campoId: string, valor: unknown): Promise<void> {
  const cid = await clienteDe(c);
  await c.query(
    `insert into nucleo.campos_valor (cliente_id, objeto_tipo, objeto_id, campo_id, valor)
       values ($1,$2,$3,$4,$5)
     on conflict (cliente_id, objeto_tipo, objeto_id, campo_id)
       do update set valor=excluded.valor, actualizado_en=now()`,
    [cid, objetoTipo, objetoId, campoId, JSON.stringify(valor)]);
}

/** Objetos con un valor de campo (igualdad). Numérico compara como número. */
export async function objetosPorCampo(c: PoolClient, campoId: string, valor: unknown, limite = 50): Promise<string[]> {
  const cid = await clienteDe(c);
  const r = await c.query(
    `select objeto_id from nucleo.campos_valor
       where cliente_id=$1 and campo_id=$2 and valor = $3::jsonb limit $4`,
    [cid, campoId, JSON.stringify(valor), limite]);
  return r.rows.map((x) => x.objeto_id as string);
}
