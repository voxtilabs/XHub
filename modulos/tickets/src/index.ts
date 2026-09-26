import type { PoolClient } from "pg";
import { ErrorApi, codificarCursor, decodificarCursor } from "@xhub/core";
import type { DefinicionModulo } from "@xhub/sdk-modulo";
import { asegurarPersonaPorIdentidad, registrarInteraccion } from "@xhub/modulo-nucleo";

export type EstadoTicket = "nuevo" | "abierto" | "pendiente" | "resuelto" | "cerrado";
export type Prioridad = "baja" | "media" | "alta" | "urgente";

// Estados de proceso con transiciones válidas (máquina de estados).
const TRANSICIONES: Record<EstadoTicket, EstadoTicket[]> = {
  nuevo:      ["abierto", "cerrado"],
  abierto:    ["pendiente", "resuelto", "cerrado"],
  pendiente:  ["abierto", "resuelto", "cerrado"],
  resuelto:   ["abierto", "cerrado"],           // reabrir
  cerrado:    ["abierto"],                        // reabrir un cerrado
};
export function puedeTransicionar(de: EstadoTicket, a: EstadoTicket): boolean {
  return TRANSICIONES[de]?.includes(a) ?? false;
}

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

export interface Ticket {
  id: string; numero: string; persona_id: string; asunto: string;
  estado: EstadoTicket; prioridad: Prioridad; canal_origen: string | null;
  asignado_a: string | null; resumen: string | null;
}

async function proximoNumero(c: PoolClient, cid: string): Promise<number> {
  const r = await c.query(
    `insert into tickets_correlativo (cliente_id, proximo) values ($1, 2)
       on conflict (cliente_id) do update set proximo = tickets_correlativo.proximo + 1
       returning proximo - 1 as n`, [cid]);
  return r.rows[0].n;
}

/**
 * Crea un ticket. La persona la asegura el NÚCLEO (por su canal de origen), y la
 * apertura queda en la línea de tiempo del núcleo. El ticket es del módulo.
 */
export async function crearTicket(c: PoolClient, args: {
  canal: string; identidad: string; asunto: string; prioridad?: Prioridad; canalOrigen?: string; cuerpo?: string;
}): Promise<Ticket> {
  const cid = await clienteDe(c);
  if (!args.asunto.trim()) throw new ErrorApi("VALIDACION", "El asunto es obligatorio");
  const persona = await asegurarPersonaPorIdentidad(c, args.canal as never, args.identidad);
  const numero = await proximoNumero(c, cid);
  const r = await c.query(
    `insert into tickets (cliente_id, numero, persona_id, asunto, prioridad, canal_origen)
       values ($1,$2,$3,$4,$5,$6)
       returning id, numero::text, persona_id, asunto, estado, prioridad, canal_origen, asignado_a, resumen`,
    [cid, numero, persona.id, args.asunto.trim(), args.prioridad ?? "media", args.canalOrigen ?? args.canal]);
  const t = r.rows[0] as Ticket;
  if (args.cuerpo)
    await c.query("insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, cuerpo) values ($1,$2,'persona',$3)", [cid, t.id, args.cuerpo]);
  // la historia va al núcleo
  await registrarInteraccion(c, { personaId: persona.id, tipo: "ticket.creado", moduloOrigen: "tickets",
    objetoTipo: "ticket", objetoId: t.id, resumen: `Ticket #${numero}: ${args.asunto.slice(0, 60)}` });
  return t;
}

export async function asignarTicket(c: PoolClient, ticketId: string, usuarioId: string): Promise<void> {
  const cid = await clienteDe(c);
  const r = await c.query("update tickets set asignado_a=$2, actualizado_en=now() where id=$1 and cliente_id=$3", [ticketId, usuarioId, cid]);
  if (r.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
}

export async function cambiarEstado(c: PoolClient, ticketId: string, a: EstadoTicket): Promise<Ticket> {
  const cid = await clienteDe(c);
  const cur = await c.query("select estado, persona_id, numero from tickets where id=$1 and cliente_id=$2", [ticketId, cid]);
  if (cur.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
  const de = cur.rows[0].estado as EstadoTicket;
  if (de === a) { /* idempotente */ }
  else if (!puedeTransicionar(de, a))
    throw new ErrorApi("CONFLICTO", `Transición inválida: ${de} → ${a}`, { de, a });
  const resuelto = a === "resuelto" ? "resuelto_en=now()," : "";
  const r = await c.query(
    `update tickets set estado=$2, ${resuelto} actualizado_en=now() where id=$1
       returning id, numero::text, persona_id, asunto, estado, prioridad, canal_origen, asignado_a, resumen`,
    [ticketId, a]);
  await registrarInteraccion(c, { personaId: cur.rows[0].persona_id, tipo: "ticket.estado", moduloOrigen: "tickets",
    objetoTipo: "ticket", objetoId: ticketId, resumen: `Ticket #${cur.rows[0].numero} → ${a}` });
  return r.rows[0] as Ticket;
}

/** Agrega un mensaje a la conversación del ticket. Interno = no visible al cliente. */
export async function agregarMensaje(c: PoolClient, ticketId: string, args: { autorTipo: "persona" | "agente" | "sistema"; autorId?: string; cuerpo: string; interno?: boolean }): Promise<void> {
  const cid = await clienteDe(c);
  await c.query(
    "insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, autor_id, cuerpo, interno) values ($1,$2,$3,$4,$5,$6)",
    [cid, ticketId, args.autorTipo, args.autorId ?? null, args.cuerpo, args.interno ?? false]);
}

/**
 * Genera y guarda un resumen de la conversación del ticket. En el producto real
 * lo produce la IA; aquí toma los mensajes NO internos y arma un resumen legible
 * (la interfaz es la misma: el resumen se guarda en el ticket).
 */
export async function resumirConversacion(c: PoolClient, ticketId: string, resumen?: string): Promise<string> {
  const cid = await clienteDe(c);
  let texto = resumen;
  if (!texto) {
    const m = await c.query(
      "select autor_tipo, cuerpo from tickets_mensajes where cliente_id=$1 and ticket_id=$2 and interno=false order by seq asc",
      [cid, ticketId]);
    const n = m.rowCount ?? 0;
    const primero = m.rows[0]?.cuerpo?.slice(0, 120) ?? "";
    texto = n === 0 ? "Sin mensajes aún." : `${n} mensaje(s). Motivo inicial: ${primero}`;
  }
  await c.query("update tickets set resumen=$2, actualizado_en=now() where id=$1 and cliente_id=$3", [ticketId, texto, cid]);
  return texto;
}

export interface PaginaTickets { datos: Ticket[]; siguiente: string | null; }

/** Bandeja: tickets por estado/asignación, keyset. */
export async function listarBandeja(c: PoolClient, filtro: { estado?: EstadoTicket; asignadoA?: string } = {}, cursor?: string, limite = 25): Promise<PaginaTickets> {
  const cid = await clienteDe(c);
  const cond: string[] = ["t.cliente_id=$1"];
  const params: unknown[] = [cid];
  if (filtro.estado) { params.push(filtro.estado); cond.push(`t.estado=$${params.length}`); }
  if (filtro.asignadoA) { params.push(filtro.asignadoA); cond.push(`t.asignado_a=$${params.length}`); }
  const desde = decodificarCursor(cursor);
  if (desde) { params.push(desde); cond.push(`t.numero < $${params.length}`); }
  params.push(limite + 1);
  const r = await c.query(
    `select t.id, t.numero::text, t.persona_id, t.asunto, t.estado, t.prioridad, t.canal_origen, t.asignado_a, t.resumen, t.numero as _n
       from tickets t where ${cond.join(" and ")} order by t.numero desc limit $${params.length}`, params);
  const filas = r.rows as (Ticket & { _n: number })[];
  const hayMas = filas.length > limite;
  const datos = (hayMas ? filas.slice(0, limite) : filas).map(({ _n, ...t }) => t);
  const siguiente = hayMas ? codificarCursor(filas[limite - 1]._n) : null;
  return { datos, siguiente };
}

/** Definición del módulo para el SDK. */
export const definicion: DefinicionModulo = {
  manifiesto: {
    nombre: "tickets",
    depende: ["nucleo"],
    permisos: ["tickets.leer", "tickets.crear", "tickets.responder", "tickets.asignar", "tickets.manage"],
    eventos: ["ticket.creado", "ticket.estado", "ticket.asignado"],
  },
  migraciones: ["0013_tickets.sql"],
  rutas: [
    { metodo: "GET", ruta: "/tickets", scope: "tickets.leer" },
    { metodo: "POST", ruta: "/tickets", scope: "tickets.crear" },
    { metodo: "PUT", ruta: "/tickets/:id/estado", scope: "tickets.responder" },
    { metodo: "PUT", ruta: "/tickets/:id/asignar", scope: "tickets.asignar" },
  ],
};
