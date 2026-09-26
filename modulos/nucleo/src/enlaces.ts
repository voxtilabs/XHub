import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { emitir } from "@xhub/db";
import { resolverRaiz } from "./personas.js";

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

/** Enlaza dos objetos. Idempotente por la combinación única. */
export async function enlazar(
  c: PoolClient, origenTipo: string, origenId: string, tipoEnlace: string, destinoTipo: string, destinoId: string,
): Promise<void> {
  const cid = await clienteDe(c);
  await c.query(
    `insert into nucleo.enlaces (cliente_id, origen_tipo, origen_id, tipo_enlace, destino_tipo, destino_id)
     values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
    [cid, origenTipo, origenId, tipoEnlace, destinoTipo, destinoId],
  );
}

export interface Enlace { origen_tipo: string; origen_id: string; tipo_enlace: string; destino_tipo: string; destino_id: string; }

/** Enlaces de un objeto, desde CUALQUIERA de los dos extremos. */
export async function enlacesDe(c: PoolClient, tipo: string, id: string): Promise<Enlace[]> {
  const cid = await clienteDe(c);
  const r = await c.query(
    `select origen_tipo, origen_id, tipo_enlace, destino_tipo, destino_id
       from nucleo.enlaces
      where cliente_id=$1 and ((origen_tipo=$2 and origen_id=$3) or (destino_tipo=$2 and destino_id=$3))
      order by seq asc`,
    [cid, tipo, id],
  );
  return r.rows as Enlace[];
}

/**
 * Fusiona la persona duplicada en la principal. NADA se borra: la duplicada queda
 * marcada fusionada_en. En la MISMA transacción mueve identidades e interacciones,
 * repunta los enlaces del NÚCLEO que apuntaban a 'persona', y emite persona.fusionada
 * por el outbox para que los MÓDULOS re-apunten lo suyo. Revertir la tx ⇒ no hay evento.
 */
export async function fusionarPersonas(c: PoolClient, principalId: string, duplicadaId: string): Promise<void> {
  const cid = await clienteDe(c);
  if (principalId === duplicadaId) throw new ErrorApi("VALIDACION", "No se puede fusionar una persona consigo misma");
  const principal = await resolverRaiz(c, principalId);
  const dup = await resolverRaiz(c, duplicadaId);
  if (principal.id === dup.id) return; // ya eran la misma

  // mover identidades (respetando el único por canal: si colisiona, la de la duplicada se descarta)
  await c.query(
    `update nucleo.identidades i set persona_id=$1
       where i.persona_id=$2 and not exists (
         select 1 from nucleo.identidades j
          where j.cliente_id=i.cliente_id and j.persona_id=$1 and j.canal=i.canal and j.identificador=i.identificador)`,
    [principal.id, dup.id],
  );
  // mover interacciones: el trigger append-only permite repuntar SOLO persona_id
  // (no hay bypass ni privilegio de dueño; el contenido sigue inmutable).
  await c.query("update nucleo.interacciones set persona_id=$1 where persona_id=$2 and cliente_id=$3", [principal.id, dup.id, cid]);

  // repuntar enlaces del núcleo (origen y destino de tipo 'persona')
  await c.query(
    `update nucleo.enlaces set origen_id=$1 where cliente_id=$3 and origen_tipo='persona' and origen_id=$2
       and not exists (select 1 from nucleo.enlaces e2 where e2.cliente_id=$3 and e2.origen_tipo='persona'
         and e2.origen_id=$1 and e2.tipo_enlace=nucleo.enlaces.tipo_enlace and e2.destino_tipo=nucleo.enlaces.destino_tipo
         and e2.destino_id=nucleo.enlaces.destino_id)`,
    [principal.id, dup.id, cid],
  );
  await c.query(
    `update nucleo.enlaces set destino_id=$1 where cliente_id=$3 and destino_tipo='persona' and destino_id=$2
       and not exists (select 1 from nucleo.enlaces e2 where e2.cliente_id=$3 and e2.destino_tipo='persona'
         and e2.destino_id=$1 and e2.tipo_enlace=nucleo.enlaces.tipo_enlace and e2.origen_tipo=nucleo.enlaces.origen_tipo
         and e2.origen_id=nucleo.enlaces.origen_id)`,
    [principal.id, dup.id, cid],
  );
  // borrar los enlaces de la duplicada que quedaron como duplicados exactos
  await c.query("delete from nucleo.enlaces where cliente_id=$2 and origen_tipo='persona' and origen_id=$1", [dup.id, cid]);
  await c.query("delete from nucleo.enlaces where cliente_id=$2 and destino_tipo='persona' and destino_id=$1", [dup.id, cid]);

  // marcar la duplicada como fusionada (puntero, nada se borra)
  await c.query("update nucleo.personas set fusionada_en=$1 where id=$2 and cliente_id=$3", [principal.id, dup.id, cid]);

  // avisar a los módulos para que re-apunten SUS objetos (ticket, oportunidad)
  await emitir(c, { clienteId: cid, modulo: "nucleo", tipo: "persona.fusionada",
    payload: { principalId: principal.id, duplicadaId: dup.id } });
}
