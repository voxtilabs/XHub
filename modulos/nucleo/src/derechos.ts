import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { emitir } from "@xhub/db";
import { auditar } from "@xhub/db";
import { resolverRaiz } from "./personas.js";

async function cid(c: PoolClient): Promise<string> {
  const v = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  if (!v) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return v;
}

/**
 * DERECHO DE ACCESO (Ley 21.719): todo lo que xHub tiene sobre una persona, en un
 * export portable. Incluye identidades, interacciones, etiquetas y campos del núcleo.
 * Los módulos (tickets) agregan lo suyo por su cuenta; aquí va la espina dorsal.
 */
export async function exportarPersona(c: PoolClient, personaId: string): Promise<Record<string, unknown>> {
  const clienteId = await cid(c);
  const persona = await resolverRaiz(c, personaId);
  const ident = await c.query("select canal, identificador, creado_en from nucleo.identidades where persona_id=$1 order by seq", [persona.id]);
  const inter = await c.query("select tipo, ocurrio_en, modulo_origen, resumen from nucleo.interacciones where persona_id=$1 order by seq", [persona.id]);
  const etq = await c.query("select e.nombre from nucleo.persona_etiquetas pe join nucleo.etiquetas e on e.cliente_id=pe.cliente_id and e.id=pe.etiqueta_id where pe.persona_id=$1", [persona.id]);
  const campos = await c.query("select d.nombre, v.valor from nucleo.campos_valor v join nucleo.campos_def d on d.cliente_id=v.cliente_id and d.id=v.campo_id where v.objeto_tipo='persona' and v.objeto_id=$1::text", [persona.id]);
  await c.query("insert into nucleo.derechos_solicitudes (cliente_id, persona_id, tipo, motivo) values ($1,$2,'acceso','Exportación de datos del titular')", [clienteId, persona.id]);
  // La auditoría se escribe por la conexión de dueño (append-only, encadenada por hash);
  // el rol de app no tiene la secuencia. Ver leyes de la casa 8.
  await auditar({ clienteId, actorTipo: "usuario", accion: "derechos.acceso", recurso: "persona", recursoId: persona.id, resultado: "ok" });
  return {
    persona: { id: persona.id, nombre: persona.nombre },
    identidades: ident.rows, interacciones: inter.rows,
    etiquetas: etq.rows.map((x) => x.nombre), campos: campos.rows,
    generado_en: "(sello en el momento de la exportación)",
  };
}

/**
 * DERECHO DE SUPRESIÓN (Ley 21.719). Suprimir NO es borrar la fila — los objetos de
 * los módulos (tickets, oportunidades) cuelgan de la persona, y la auditoría es la
 * evidencia legal. Suprimir = ANONIMIZAR la persona y BORRAR contenido:
 *  - nombre → null; identidades → token no reversible (la fila queda, sin PII).
 *  - interacciones: se vacía el resumen y la meta (el hecho queda, el contenido no).
 *  - campos personalizados: se eliminan.
 *  - se marca suprimida_en, se registra la solicitud y se AUDITA.
 *  - se emite 'persona.suprimida' para que los módulos borren SU contenido (cuerpos
 *    de tickets, notas) manteniendo sus registros.
 * Motivo obligatorio. La auditoría NUNCA se toca.
 */
export async function suprimirPersona(c: PoolClient, personaId: string, motivo: string): Promise<{ personaId: string }> {
  const clienteId = await cid(c);
  if (!motivo?.trim()) throw new ErrorApi("VALIDACION", "El motivo de la supresión es obligatorio");
  const persona = await resolverRaiz(c, personaId);
  // anonimizar identidades: token no reversible por (canal), la unicidad se mantiene
  await c.query(
    "update nucleo.identidades set identificador = 'suprimido:' || encode(digest(identificador || $2, 'sha256'),'hex') where persona_id=$1",
    [persona.id, persona.id]);
  // borrar contenido de interacciones (el hecho y su seq quedan; el contenido no).
  // La línea es append-only: se abre la llave de sesión para el único camino permitido.
  await c.query("select set_config('app.supresion','on',true)");
  await c.query("update nucleo.interacciones set resumen=null, meta='{}' where persona_id=$1", [persona.id]);
  // borrar campos personalizados
  await c.query("delete from nucleo.campos_valor where cliente_id=$1 and objeto_tipo='persona' and objeto_id=$2::text", [clienteId, persona.id]);
  // anonimizar la persona y marcarla suprimida (la fila NO se borra)
  await c.query("update nucleo.personas set nombre=null, suprimida_en=now() where id=$1 and cliente_id=$2", [persona.id, clienteId]);
  // refrescar el índice de búsqueda (ya no debe encontrarla por nombre)
  await c.query("update nucleo.persona_busqueda set texto='', vector=to_tsvector('spanish','') where persona_id=$1", [persona.id]).catch(() => {});
  // registrar la solicitud + auditar (evidencia; la auditoría no se anonimiza)
  await c.query("insert into nucleo.derechos_solicitudes (cliente_id, persona_id, tipo, motivo) values ($1,$2,'supresion',$3)", [clienteId, persona.id, motivo.trim()]);
  await auditar({ clienteId, actorTipo: "usuario", accion: "derechos.supresion", recurso: "persona", recursoId: persona.id, resultado: "ok", metadata: { motivo: motivo.trim() } });
  // avisar a los módulos para que borren SU contenido (cuerpos de tickets, etc.)
  await emitir(c, { clienteId, modulo: "nucleo", tipo: "persona.suprimida", payload: { personaId: persona.id } });
  return { personaId: persona.id };
}
