import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { normalizarIdentidad, type Canal } from "./normalizar.js";
import { fusionarPersonas } from "./enlaces.js";

export interface Persona { id: string; nombre: string | null; fusionada_en: string | null; }

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exigirUuid(v: string, campo: string): void {
  if (!RE_UUID.test(v)) throw new ErrorApi("VALIDACION", `${campo} no es un identificador válido`, { valor: v });
}

/** Sigue el puntero fusionada_en hasta la persona viva (con corte de ciclo). */
export async function resolverRaiz(c: PoolClient, id: string): Promise<Persona> {
  exigirUuid(id, "personaId");
  const visto = new Set<string>();
  let actual = id;
  for (;;) {
    if (visto.has(actual)) throw new ErrorApi("CONFLICTO", "Ciclo de fusión detectado", { id: actual });
    visto.add(actual);
    const r = await c.query("select id, nombre, fusionada_en from nucleo.personas where id=$1", [actual]);
    if (r.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Persona no encontrada", { id });
    const p = r.rows[0] as Persona;
    if (!p.fusionada_en) return p;
    actual = p.fusionada_en;
  }
}

export async function obtenerPersona(c: PoolClient, id: string): Promise<Persona> {
  return resolverRaiz(c, id);
}

/**
 * Idempotente e inmune a carrera: si la identidad existe devuelve su persona
 * (resuelta a la raíz viva); si no, crea persona + identidad. Advisory lock por
 * (cliente, canal, valor) evita que dos transacciones creen dos personas.
 */
export async function asegurarPersonaPorIdentidad(
  c: PoolClient, canal: Canal, valor: string, nombre?: string,
): Promise<Persona> {
  const clienteId = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!clienteId) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  const norm = normalizarIdentidad(canal, valor);

  // advisory lock transaccional por identidad (dos claves int a partir del hash)
  await c.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${clienteId}:${canal}:${norm}`]);

  const ya = await c.query(
    "select persona_id from nucleo.identidades where cliente_id=$1 and canal=$2 and identificador=$3",
    [clienteId, canal, norm],
  );
  if (ya.rowCount && ya.rows[0].persona_id) return resolverRaiz(c, ya.rows[0].persona_id);

  const per = await c.query(
    "insert into nucleo.personas (cliente_id, nombre) values ($1,$2) returning id, nombre, fusionada_en",
    [clienteId, nombre ?? null],
  );
  const persona = per.rows[0] as Persona;
  await c.query(
    "insert into nucleo.identidades (cliente_id, persona_id, canal, identificador) values ($1,$2,$3,$4)",
    [clienteId, persona.id, canal, norm],
  );
  return persona;
}

/** Agrega una identidad a una persona viva ya existente. */
export async function adjuntarIdentidad(c: PoolClient, personaId: string, canal: Canal, valor: string): Promise<void> {
  const raiz = await resolverRaiz(c, personaId);
  const clienteId = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  const norm = normalizarIdentidad(canal, valor);
  try {
    await c.query(
      "insert into nucleo.identidades (cliente_id, persona_id, canal, identificador) values ($1,$2,$3,$4)",
      [clienteId, raiz.id, canal, norm],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new ErrorApi("CONFLICTO", "Esa identidad ya pertenece a otra persona", { canal, valor: norm });
    throw e;
  }
}

/**
 * Adjunta una identidad de forma IDEMPOTENTE (para la ingesta): si ya existe —en esta
 * u otra persona— no hace nada y NO aborta la transacción (a diferencia de
 * adjuntarIdentidad, que lanza en el duplicado). Devuelve true si la creó.
 */
export async function asegurarIdentidad(c: PoolClient, personaId: string, canal: Canal, valor: string): Promise<boolean> {
  const raiz = await resolverRaiz(c, personaId);
  const clienteId = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  const norm = normalizarIdentidad(canal, valor);
  const r = await c.query(
    "insert into nucleo.identidades (cliente_id, persona_id, canal, identificador) values ($1,$2,$3,$4) on conflict do nothing",
    [clienteId, raiz.id, canal, norm]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Reconcilia una persona por CUALQUIERA de sus identidades (RUT, email, teléfono, id
 * externo): si varias ya existen en personas distintas, las FUSIONA en una sola; si una
 * existe, adjunta el resto de identidades a esa; si ninguna existe, crea la persona. Así
 * un contacto de XContact que comparte el RUT con la persona de un ticket termina siendo
 * la MISMA persona, y el teléfono del contacto aparece en el ticket. Devuelve la persona
 * resultante y los ids de las personas que se fusionaron (para repuntar objetos de módulo).
 */
export async function reconciliarPersona(
  c: PoolClient, identidades: { canal: Canal; valor: string }[], nombre?: string,
): Promise<{ persona: Persona; idsFusionadas: string[] }> {
  const clienteId = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!clienteId) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  const ids = identidades.filter((i) => i.valor && String(i.valor).trim());
  if (ids.length === 0) throw new ErrorApi("VALIDACION", "Sin identidades para reconciliar");

  // Advisory lock por la primera identidad para serializar reconciliaciones concurrentes.
  const primaria = ids[0];
  await c.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${clienteId}:rec:${primaria.canal}:${normalizarIdentidad(primaria.canal, primaria.valor)}`]);

  // Dueños existentes de CUALQUIERA de las identidades (resueltos a su raíz, sin repetir).
  const dueños: string[] = [];
  for (const { canal, valor } of ids) {
    const norm = normalizarIdentidad(canal, valor);
    const r = await c.query("select persona_id from nucleo.identidades where cliente_id=$1 and canal=$2 and identificador=$3", [clienteId, canal, norm]);
    if (r.rowCount) { const raiz = await resolverRaiz(c, r.rows[0].persona_id); if (!dueños.includes(raiz.id)) dueños.push(raiz.id); }
  }

  let principalId: string; const idsFusionadas: string[] = [];
  if (dueños.length === 0) {
    principalId = (await asegurarPersonaPorIdentidad(c, primaria.canal, primaria.valor, nombre)).id;
  } else {
    principalId = dueños[0];
    for (const otra of dueños.slice(1)) { await fusionarPersonas(c, principalId, otra); idsFusionadas.push(otra); }
  }
  // Adjuntar todas las identidades del contacto a la principal (idempotente).
  for (const { canal, valor } of ids) await asegurarIdentidad(c, principalId, canal, valor);
  if (nombre?.trim()) await c.query("update nucleo.personas set nombre=$2 where id=$1 and (nombre is null or nombre='')", [principalId, nombre.trim()]);
  return { persona: await resolverRaiz(c, principalId), idsFusionadas };
}

export interface Identidad { canal: Canal; identificador: string; seq: string; }
export async function identidadesDe(c: PoolClient, personaId: string): Promise<Identidad[]> {
  const raiz = await resolverRaiz(c, personaId);
  const r = await c.query(
    "select i.canal, i.identificador, i.seq::text as seq from nucleo.identidades i where i.persona_id=$1 order by i.seq asc",
    [raiz.id],
  );
  return r.rows as Identidad[];
}
