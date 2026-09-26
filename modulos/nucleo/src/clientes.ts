import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";

export type EstadoCliente = "en_alta" | "activo" | "moroso" | "solo_lectura" | "suspendido";

/** Transiciones válidas del ciclo de vida de un cliente (#21). */
const TRANSICIONES: Record<EstadoCliente, EstadoCliente[]> = {
  en_alta:      ["activo", "suspendido"],
  activo:       ["moroso", "solo_lectura", "suspendido"],
  moroso:       ["activo", "solo_lectura", "suspendido"],
  solo_lectura: ["activo", "suspendido"],
  suspendido:   ["activo"], // se puede reactivar
};

export function puedeTransicionar(de: EstadoCliente, a: EstadoCliente): boolean {
  return TRANSICIONES[de]?.includes(a) ?? false;
}

export interface Cliente { id: string; nombre: string; estado: EstadoCliente; }

export async function crearCliente(c: PoolClient, nombre: string): Promise<Cliente> {
  if (!nombre.trim()) throw new ErrorApi("VALIDACION", "El nombre del cliente es obligatorio");
  const r = await c.query(
    "insert into plataforma.clientes(nombre, estado) values($1, 'en_alta') returning id, nombre, estado",
    [nombre.trim()],
  );
  return r.rows[0];
}

export async function obtenerCliente(c: PoolClient, id: string): Promise<Cliente> {
  const r = await c.query("select id, nombre, estado from plataforma.clientes where id=$1", [id]);
  if (r.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Cliente no encontrado", { id });
  return r.rows[0];
}

/** Cambia el estado validando la transición. Una inválida es 409, no un cambio silencioso. */
export async function cambiarEstado(c: PoolClient, id: string, a: EstadoCliente): Promise<Cliente> {
  const actual = await obtenerCliente(c, id);
  if (actual.estado === a) return actual; // idempotente
  if (!puedeTransicionar(actual.estado, a))
    throw new ErrorApi("CONFLICTO", `Transición inválida: ${actual.estado} → ${a}`, { de: actual.estado, a });
  const r = await c.query(
    "update plataforma.clientes set estado=$2 where id=$1 returning id, nombre, estado",
    [id, a],
  );
  return r.rows[0];
}
