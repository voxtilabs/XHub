import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { resolverRaiz, identidadesDe, type Identidad } from "./personas.js";
import { lineaDeTiempo, type Interaccion } from "./interacciones.js";
import { enlacesDe, type Enlace } from "./enlaces.js";

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

export interface ResultadoBusqueda {
  personaId: string; texto: string;
  nombre: string | null;
  identidades: { canal: string; valor: string }[];
}

/**
 * Busca personas por nombre o identidad (teléfono/email/RUT), en español. RANKEADA:
 * prefijo de nombre primero, luego relevancia full-text. Devuelve nombre + identidades
 * (no el blob crudo) para pintar un resultado legible. Excluye fusionadas. RLS.
 */
export async function buscarPersonas(c: PoolClient, termino: string, limite = 20): Promise<ResultadoBusqueda[]> {
  const cid = await clienteDe(c);
  const t = termino.trim();
  if (!t) return [];
  const r = await c.query(
    `select p.id as persona_id, p.nombre, b.texto,
            coalesce(json_agg(json_build_object('canal', i.canal, 'valor', i.identificador)
                     order by (i.canal='telefono') desc, (i.canal='email') desc, i.canal)
                     filter (where i.id is not null), '[]') as identidades
       from nucleo.persona_busqueda b
       join nucleo.personas p on p.cliente_id=b.cliente_id and p.id=b.persona_id
       left join nucleo.identidades i on i.cliente_id=p.cliente_id and i.persona_id=p.id
      where b.cliente_id=$1 and p.fusionada_en is null
        and (b.vector @@ plainto_tsquery('spanish', unaccent($2)) or b.texto ilike '%' || $2 || '%')
      group by p.id, p.nombre, b.texto, b.vector
      order by (lower(coalesce(p.nombre,'')) like lower($2) || '%') desc,
               ts_rank_cd(b.vector, plainto_tsquery('spanish', unaccent($2))) desc,
               p.nombre nulls last
      limit $3`,
    [cid, t, limite]);
  return r.rows.map((x) => ({ personaId: x.persona_id, texto: x.texto, nombre: x.nombre, identidades: x.identidades as { canal: string; valor: string }[] }));
}

export interface Ficha {
  persona: { id: string; nombre: string | null };
  identidades: Identidad[];
  etiquetas: { id: string; nombre: string; color_rol: string }[];
  campos: { nombre: string; tipo: string; valor: unknown }[];
  lineaDeTiempo: Interaccion[];
  enlaces: Enlace[];
  // Fuente espejada (modo degradado #67): si la persona vino del conector, su origen
  // y la fecha del último dato traído — para avisar «datos desactualizados» en pantalla.
  fuente: { tipo: string; externoId: string | null; ultimoDato: string | null } | null;
}

/**
 * Ficha 360 de una persona en UNA respuesta. Resuelve el puntero de fusión (una
 * absorbida redirige a la superviviente). Los módulos apagados simplemente no
 * aportan filas a la línea de tiempo — la ficha NO falla por eso.
 */
export async function fichaDePersona(c: PoolClient, personaId: string, limiteTimeline = 50): Promise<Ficha> {
  const cid = await clienteDe(c);
  const persona = await resolverRaiz(c, personaId); // redirige si está fusionada

  const identidades = await identidadesDe(c, persona.id);
  const et = await c.query(
    `select e.id, e.nombre, e.color_rol from nucleo.persona_etiquetas pe
       join nucleo.etiquetas e on e.cliente_id=pe.cliente_id and e.id=pe.etiqueta_id
      where pe.cliente_id=$1 and pe.persona_id=$2`, [cid, persona.id]);
  const campos = await c.query(
    `select d.nombre, d.tipo, v.valor from nucleo.campos_valor v
       join nucleo.campos_def d on d.cliente_id=v.cliente_id and d.id=v.campo_id
      where v.cliente_id=$1 and v.objeto_tipo='persona' and v.objeto_id=$2::text`, [cid, persona.id]);
  const tl = await lineaDeTiempo(c, persona.id, undefined, limiteTimeline);
  const enl = await enlacesDe(c, "persona", persona.id);

  // Fuente espejada: si tiene identidad xcontact, vino del conector. El «último dato»
  // es la interacción más reciente escrita por el conector (su última sincronización).
  const xc = identidades.find((i) => i.canal === "xcontact");
  let fuente: Ficha["fuente"] = null;
  if (xc) {
    const ud = await c.query(
      "select max(ocurrio_en)::text as ultimo from nucleo.interacciones where cliente_id=$1 and persona_id=$2 and modulo_origen='conector'",
      [cid, persona.id]);
    fuente = { tipo: "xcontact", externoId: xc.identificador, ultimoDato: ud.rows[0]?.ultimo ?? null };
  }

  return {
    persona: { id: persona.id, nombre: persona.nombre },
    identidades,
    etiquetas: et.rows,
    campos: campos.rows,
    lineaDeTiempo: tl.datos,
    enlaces: enl,
    fuente,
  };
}
