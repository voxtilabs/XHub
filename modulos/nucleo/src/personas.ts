import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { normalizarIdentidad, type Canal } from "./normalizar.js";

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

export interface Identidad { canal: Canal; identificador: string; seq: string; }
export async function identidadesDe(c: PoolClient, personaId: string): Promise<Identidad[]> {
  const raiz = await resolverRaiz(c, personaId);
  const r = await c.query(
    "select canal, identificador, seq::text from nucleo.identidades where persona_id=$1 order by seq asc",
    [raiz.id],
  );
  return r.rows as Identidad[];
}
