import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";

// Modulo "Etiquetas + campos personalizados" de la espina dorsal (nucleo).
// Patron (igual que modulos/nucleo/clientes.ts): cada funcion recibe el cliente
// pg YA dentro de la transaccion del tenant. El caller es SIEMPRE conCliente(...)
// de @xhub/db — unico camino de escritura de negocio. Estas funciones NO abren
// transacciones ni fijan app.cliente_id: lo hace conCliente.
//
// El cliente_id nunca se pasa por argumento: se toma de la sesion con
// current_setting('app.cliente_id'), de modo que jamas puede divergir del tenant
// fijado por conCliente y el WITH CHECK de la RLS lo confirma.

export type ColorRol = "accion" | "senal" | "exito" | "neutro";
export type TipoCampo = "texto" | "numero" | "fecha" | "bool";
export type ObjetoTipo = string; // abierto: 'persona' | 'ticket' | 'oportunidad' | ...

export interface Etiqueta { id: string; cliente_id: string; nombre: string; color_rol: ColorRol; }
export interface CampoDef { id: string; cliente_id: string; objeto_tipo: string; nombre: string; tipo: TipoCampo; }

const COLORES: readonly ColorRol[] = ["accion", "senal", "exito", "neutro"];
const TIPOS: readonly TipoCampo[] = ["texto", "numero", "fecha", "bool"];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// El cliente de la sesion, como expresion SQL reutilizable.
const CLIENTE_SESION = "nullif(current_setting('app.cliente_id', true), '')::uuid";

// Codigos de error de Postgres que traducimos a ErrorApi.
const PG_UNIQUE = "23505";
const PG_FK = "23503";
function esPg(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === code;
}

// ------------------------------- ETIQUETAS -------------------------------

/** Crea una etiqueta del cliente de la sesion. Color por ROL, no hex. */
export async function crearEtiqueta(
  c: PoolClient, nombre: string, colorRol: ColorRol = "neutro",
): Promise<Etiqueta> {
  const n = nombre.trim();
  if (!n) throw new ErrorApi("VALIDACION", "El nombre de la etiqueta es obligatorio");
  if (!COLORES.includes(colorRol))
    throw new ErrorApi("VALIDACION", `color_rol invalido: ${colorRol}`, { permitidos: COLORES });
  try {
    const r = await c.query(
      `insert into nucleo.etiquetas (cliente_id, nombre, color_rol)
         values (${CLIENTE_SESION}, $1, $2)
       returning id, cliente_id, nombre, color_rol`,
      [n, colorRol],
    );
    return r.rows[0] as Etiqueta;
  } catch (e) {
    if (esPg(e, PG_UNIQUE))
      throw new ErrorApi("CONFLICTO", "Ya existe una etiqueta con ese nombre", { nombre: n });
    throw e;
  }
}

/** Lista las etiquetas del cliente (RLS acota al tenant). */
export async function listarEtiquetas(c: PoolClient): Promise<Etiqueta[]> {
  const r = await c.query(
    `select id, cliente_id, nombre, color_rol
       from nucleo.etiquetas order by lower(nombre)`,
  );
  return r.rows as Etiqueta[];
}

/**
 * Aplica una etiqueta a una persona. IDEMPOTENTE: la PK compuesta absorbe el
 * duplicado. Devuelve { aplicada:false } si ya estaba puesta.
 * La FK compuesta impide etiquetar una persona de otro cliente (23503).
 */
export async function aplicarEtiqueta(
  c: PoolClient, personaId: string, etiquetaId: string,
): Promise<{ aplicada: boolean }> {
  try {
    const r = await c.query(
      `insert into nucleo.persona_etiquetas (cliente_id, persona_id, etiqueta_id)
         values (${CLIENTE_SESION}, $1, $2)
       on conflict (cliente_id, persona_id, etiqueta_id) do nothing
       returning persona_id`,
      [personaId, etiquetaId],
    );
    return { aplicada: (r.rowCount ?? 0) > 0 };
  } catch (e) {
    if (esPg(e, PG_FK))
      throw new ErrorApi("NO_ENCONTRADO", "La persona o la etiqueta no existen para este cliente",
        { personaId, etiquetaId });
    throw e;
  }
}

/** Quita una etiqueta de una persona. Idempotente: quitar lo ausente no falla. */
export async function quitarEtiqueta(
  c: PoolClient, personaId: string, etiquetaId: string,
): Promise<{ quitada: boolean }> {
  const r = await c.query(
    `delete from nucleo.persona_etiquetas
      where persona_id = $1 and etiqueta_id = $2`,
    [personaId, etiquetaId],
  );
  return { quitada: (r.rowCount ?? 0) > 0 };
}

/** Personas que llevan una etiqueta. Devuelve ids (personas viven en nucleo). */
export async function personasConEtiqueta(c: PoolClient, etiquetaId: string): Promise<string[]> {
  const r = await c.query(
    `select persona_id from nucleo.persona_etiquetas
      where etiqueta_id = $1 order by persona_id`,
    [etiquetaId],
  );
  return r.rows.map((x) => x.persona_id as string);
}

// -------------------------- CAMPOS PERSONALIZADOS --------------------------

/** Define un campo personalizado para un tipo de objeto. */
export async function definirCampo(
  c: PoolClient, objetoTipo: ObjetoTipo, nombre: string, tipo: TipoCampo,
): Promise<CampoDef> {
  const ot = objetoTipo.trim();
  const n = nombre.trim();
  if (!ot) throw new ErrorApi("VALIDACION", "objeto_tipo es obligatorio");
  if (!n) throw new ErrorApi("VALIDACION", "El nombre del campo es obligatorio");
  if (!TIPOS.includes(tipo))
    throw new ErrorApi("VALIDACION", `tipo invalido: ${tipo}`, { permitidos: TIPOS });
  try {
    const r = await c.query(
      `insert into nucleo.campos_def (cliente_id, objeto_tipo, nombre, tipo)
         values (${CLIENTE_SESION}, $1, $2, $3)
       returning id, cliente_id, objeto_tipo, nombre, tipo`,
      [ot, n, tipo],
    );
    return r.rows[0] as CampoDef;
  } catch (e) {
    if (esPg(e, PG_UNIQUE))
      throw new ErrorApi("CONFLICTO", "Ya existe un campo con ese nombre para ese objeto",
        { objetoTipo: ot, nombre: n });
    throw e;
  }
}

/**
 * Valida el valor contra el tipo declarado y lo devuelve como texto JSON escalar.
 * fecha viaja como TEXTO 'AAAA-MM-DD' (ley 3): NUNCA se construye un Date de JS
 * para mandarlo a Postgres. Aqui solo se comprueba forma y calendario en JS y se
 * guarda el texto tal cual dentro del jsonb.
 */
function aJsonEscalar(tipo: TipoCampo, valor: unknown): string {
  switch (tipo) {
    case "texto":
      if (typeof valor !== "string")
        throw new ErrorApi("VALIDACION", "El valor debe ser texto", { tipo });
      return JSON.stringify(valor);
    case "numero":
      if (typeof valor !== "number" || !Number.isFinite(valor))
        throw new ErrorApi("VALIDACION", "El valor debe ser un numero finito", { tipo });
      return JSON.stringify(valor);
    case "bool":
      if (typeof valor !== "boolean")
        throw new ErrorApi("VALIDACION", "El valor debe ser booleano", { tipo });
      return JSON.stringify(valor);
    case "fecha":
      exigirFechaTexto(valor);
      return JSON.stringify(valor);
  }
}

/** Exige texto 'AAAA-MM-DD' con calendario valido, sin usar Date para comparar contra PG. */
function exigirFechaTexto(v: unknown): asserts v is string {
  if (typeof v !== "string" || !RE_FECHA.test(v))
    throw new ErrorApi("VALIDACION", "La fecha debe ser texto 'AAAA-MM-DD'", { valor: v });
  const [a, m, d] = v.split("-").map(Number);
  const diasMes = [31, (a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > diasMes[m - 1])
    throw new ErrorApi("VALIDACION", "Fecha inexistente en el calendario", { valor: v });
}

/**
 * Pone (o reemplaza) el valor de un campo sobre un objeto. Upsert idempotente.
 * El tipo se lee de la definicion y valida el valor. La FK compuesta garantiza
 * que objeto_tipo coincide con el del campo.
 */
export async function ponerValor(
  c: PoolClient,
  args: { objetoTipo: ObjetoTipo; objetoId: string; campoId: string; valor: unknown },
): Promise<{ objeto_id: string; campo_id: string; valor: unknown }> {
  const def = await c.query(
    `select objeto_tipo, tipo from nucleo.campos_def where id = $1`, [args.campoId],
  );
  if (def.rowCount === 0)
    throw new ErrorApi("NO_ENCONTRADO", "Campo no encontrado", { campoId: args.campoId });
  if (def.rows[0].objeto_tipo !== args.objetoTipo)
    throw new ErrorApi("VALIDACION", "El campo no pertenece a ese tipo de objeto",
      { esperado: def.rows[0].objeto_tipo, recibido: args.objetoTipo });

  const json = aJsonEscalar(def.rows[0].tipo as TipoCampo, args.valor);
  const r = await c.query(
    `insert into nucleo.campos_valor (cliente_id, objeto_tipo, objeto_id, campo_id, valor)
       values (${CLIENTE_SESION}, $1, $2, $3, $4::jsonb)
     on conflict (cliente_id, objeto_tipo, objeto_id, campo_id)
       do update set valor = excluded.valor, actualizado_en = now()
     returning objeto_id, campo_id, valor`,
    [args.objetoTipo, args.objetoId, args.campoId, json],
  );
  return r.rows[0];
}

export interface FiltroCampo {
  /** Igualdad exacta contra el valor tipado. */
  igual?: unknown;
  /** Rango inclusivo, solo para numero (number) y fecha (texto 'AAAA-MM-DD'). */
  desde?: number | string;
  hasta?: number | string;
}

/**
 * Filtra PERSONAS por el valor de un campo de persona. Devuelve ids de persona.
 * fecha se compara como TEXTO 'AAAA-MM-DD' (ley 3): el orden lexicografico de ese
 * formato es cronologico y jamas se castea a ::date con un Date de JS.
 */
export async function personasPorCampo(
  c: PoolClient, campoId: string, filtro: FiltroCampo = {},
): Promise<string[]> {
  const def = await c.query(
    `select objeto_tipo, tipo from nucleo.campos_def where id = $1`, [campoId],
  );
  if (def.rowCount === 0)
    throw new ErrorApi("NO_ENCONTRADO", "Campo no encontrado", { campoId });
  if (def.rows[0].objeto_tipo !== "persona")
    throw new ErrorApi("VALIDACION", "El campo no es de personas",
      { objetoTipo: def.rows[0].objeto_tipo });
  const tipo = def.rows[0].tipo as TipoCampo;

  const cond: string[] = ["objeto_tipo = 'persona'", "campo_id = $1"];
  const params: unknown[] = [campoId];
  const p = () => `$${params.length + 1}`;

  if (filtro.igual !== undefined) {
    if (tipo === "fecha") {
      exigirFechaTexto(filtro.igual);
      cond.push(`(valor #>> '{}') = ${p()}`); params.push(filtro.igual);
    } else if (tipo === "numero") {
      if (typeof filtro.igual !== "number") throw new ErrorApi("VALIDACION", "igual debe ser numero");
      cond.push(`valor = to_jsonb(${p()}::numeric)`); params.push(filtro.igual);
    } else if (tipo === "bool") {
      if (typeof filtro.igual !== "boolean") throw new ErrorApi("VALIDACION", "igual debe ser booleano");
      cond.push(`valor = to_jsonb(${p()}::boolean)`); params.push(filtro.igual);
    } else {
      if (typeof filtro.igual !== "string") throw new ErrorApi("VALIDACION", "igual debe ser texto");
      cond.push(`valor = to_jsonb(${p()}::text)`); params.push(filtro.igual);
    }
  }

  for (const [clave, op] of [["desde", ">="], ["hasta", "<="]] as const) {
    const v = filtro[clave];
    if (v === undefined) continue;
    if (tipo === "fecha") {
      exigirFechaTexto(v);
      cond.push(`(valor #>> '{}') ${op} ${p()}`); params.push(v);
    } else if (tipo === "numero") {
      if (typeof v !== "number") throw new ErrorApi("VALIDACION", `${clave} debe ser numero`);
      cond.push(`(valor #>> '{}')::numeric ${op} ${p()}::numeric`); params.push(v);
    } else {
      throw new ErrorApi("VALIDACION", "desde/hasta solo aplican a numero o fecha", { tipo });
    }
  }

  const r = await c.query(
    `select objeto_id from nucleo.campos_valor
      where ${cond.join(" and ")} order by objeto_id`,
    params,
  );
  return r.rows.map((x) => x.objeto_id as string);
}
