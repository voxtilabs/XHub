import type { PoolClient } from "pg";
import { leerContactosV5, leerTagsV5, type ContactoNormalizado, type EtiquetaXContact } from "./xcontact-v5.js";

/**
 * sondeo-contactos.ts — orquesta el SONDEO INCREMENTAL de contactos de una instancia
 * hacia la espina dorsal (#59). El conector NO importa el núcleo ni la base: recibe
 * inyectadas las operaciones de núcleo y los abridores de transacción (igual que
 * ingesta.ts). Así corre en tests sin Postgres y respeta la frontera de módulos.
 *
 * La HTTP (leer de XContact) ocurre FUERA de transacción (ley 7); la escritura al
 * núcleo va en una tx por cliente (RLS). El cursor (último id externo procesado) hace
 * el sondeo REANUDABLE: detenerlo a mitad y reanudar no pierde ni duplica, porque la
 * ingesta ya es idempotente (dedupeId) y el cursor evita reprocesar de más.
 */
export interface NucleoContactos {
  reconciliarPersona(c: PoolClient, identidades: { canal: string; valor: string }[], nombre?: string): Promise<{ persona: { id: string }; idsFusionadas: string[] }>;
  registrarInteraccion(c: PoolClient, e: { personaId: string; tipo: string; moduloOrigen: string; objetoTipo?: string; objetoId?: string; resumen?: string; dedupeId?: string; meta?: Record<string, unknown> }): Promise<{ id?: string } | unknown>;
  asegurarEtiqueta(c: PoolClient, nombre: string): Promise<string>;
  aplicarEtiqueta(c: PoolClient, personaId: string, etiquetaId: string): Promise<void>;
  asegurarCampo(c: PoolClient, objetoTipo: string, nombre: string, tipo: string): Promise<string>;
  ponerValor(c: PoolClient, objetoTipo: string, objetoId: string, campoId: string, valor: unknown): Promise<void>;
  /** Repunta los objetos de módulo (tickets/crm/leads) de una persona fusionada. Lo
   *  provee la capa de composición: el conector no conoce esas tablas. */
  repuntarObjetos(c: PoolClient, viejoId: string, nuevoId: string): Promise<void>;
}

export interface DepsSondeo {
  conCliente<T>(clienteId: string, fn: (c: PoolClient) => Promise<T>): Promise<T>;
  conPlataforma<T>(fn: (c: PoolClient) => Promise<T>): Promise<T>;
  fetchImpl: typeof fetch;
  nucleo: NucleoContactos;
}

export interface InstanciaSondeo { id: string; clienteId: string; host: string; usuario: string; clave: string }
export interface ResumenSondeo {
  leidos: number; personas: number; interacciones: number; fusiones: number;
  etiquetados: number; campos: number; etiquetasCatalogo: number; saltados: number;
  cursorNuevo: string | null;
}

/** Ingesta pura (dentro de una tx del cliente ya abierta) de un lote ya leído. */
export async function ingestarContactos(
  c: PoolClient, contactos: ContactoNormalizado[], tags: EtiquetaXContact[], host: string, nucleo: NucleoContactos,
): Promise<Omit<ResumenSondeo, "leidos" | "cursorNuevo">> {
  let personas = 0, interacciones = 0, fusiones = 0, etiquetados = 0, campos = 0, etiquetasCatalogo = 0, saltados = 0;
  for (const t of tags) { await nucleo.asegurarEtiqueta(c, t.nombre); etiquetasCatalogo++; }
  for (const k of contactos) {
    // Cada contacto en su SAVEPOINT: uno malformado se revierte SOLO y el lote sigue.
    await c.query("savepoint sp_contacto");
    try {
      const { persona: p, idsFusionadas } = await nucleo.reconciliarPersona(
        c, k.identidades.map((i) => ({ canal: i.canal, valor: i.valor })), k.nombre ?? undefined);
      personas++;
      for (const viejo of idsFusionadas) { await nucleo.repuntarObjetos(c, viejo, p.id); fusiones++; }
      for (const nombreEtq of k.etiquetas) { await nucleo.aplicarEtiqueta(c, p.id, await nucleo.asegurarEtiqueta(c, nombreEtq)); etiquetados++; }
      for (const campo of k.campos) { await nucleo.ponerValor(c, "persona", p.id, await nucleo.asegurarCampo(c, "persona", campo.nombre, "texto"), campo.valor); campos++; }
      const it = await nucleo.registrarInteraccion(c, {
        personaId: p.id, tipo: "contacto.importado", moduloOrigen: "conector",
        objetoTipo: "contacto", objetoId: k.externoId,
        resumen: `Contacto XContact: ${k.nombre ?? k.identidad}`,
        meta: { externoId: k.externoId, canal: k.canal, host }, dedupeId: `xc:${host}:${k.externoId}`,
      });
      if ((it as { id?: string })?.id) interacciones++;
      await c.query("release savepoint sp_contacto");
    } catch {
      await c.query("rollback to savepoint sp_contacto");
      saltados++;
    }
  }
  return { personas, interacciones, fusiones, etiquetados, campos, etiquetasCatalogo, saltados };
}

/**
 * Sincroniza UNA instancia: lee incrementalmente (desde el cursor), ingesta y avanza
 * el cursor + sella la salud. Devuelve el resumen. Reutilizable por la ruta de sync
 * manual (apps/api) y por el scheduler de sondeo (apps/workers).
 */
export async function sincronizarContactosInstancia(
  deps: DepsSondeo, inst: InstanciaSondeo, opts: { limite?: number; desde?: string | null } = {},
): Promise<ResumenSondeo> {
  const ops = { host: inst.host, usuario: inst.usuario, clave: inst.clave, fetchImpl: deps.fetchImpl };
  // 1) HTTP fuera de transacción (ley 7): contactos nuevos (id > cursor) + catálogo de tags.
  const contactos = await leerContactosV5({ ...ops, limite: opts.limite ?? 200, desde: opts.desde ?? undefined });
  const tags = await leerTagsV5(ops).catch(() => []);
  // 2) Escritura al núcleo del cliente (RLS), idempotente.
  const r = await deps.conCliente(inst.clienteId, (c) => ingestarContactos(c, contactos, tags, inst.host, deps.nucleo));
  // 3) Avanzar cursor (mayor id procesado) + sellar salud. Si no vino nada, el cursor no cambia.
  const cursorNuevo = contactos.length ? contactos[contactos.length - 1].externoId : (opts.desde ?? null);
  await deps.conPlataforma(async (c) => {
    await c.query(
      `insert into plataforma.sync_cursor (instancia_id, tipo, cursor, ultimo_sync, items_ultimo, vueltas)
         values ($1,'contactos',$2, now(), $3, 1)
       on conflict (instancia_id, tipo) do update set
         cursor = coalesce(excluded.cursor, plataforma.sync_cursor.cursor),
         ultimo_sync = now(), items_ultimo = excluded.items_ultimo,
         vueltas = plataforma.sync_cursor.vueltas + 1`,
      [inst.id, cursorNuevo, contactos.length]);
    await c.query(
      "update plataforma.instancias_xcontact set estado_salud='operativa', ultimo_sondeo=now(), ultima_prueba=now(), actualizada_en=now() where id=$1",
      [inst.id]);
  });
  return { ...r, leidos: contactos.length, cursorNuevo };
}
