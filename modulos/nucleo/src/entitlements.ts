import type { PoolClient } from "pg";

/** Enciende/apaga un módulo para un cliente (operación de plataforma). */
export async function fijarEntitlement(c: PoolClient, clienteId: string, modulo: string, encendido: boolean): Promise<void> {
  await c.query(
    `insert into plataforma.entitlements (cliente_id, modulo, encendido) values ($1,$2,$3)
       on conflict (cliente_id, modulo) do update set encendido=excluded.encendido, actualizado_en=now()`,
    [clienteId, modulo, encendido]);
}

/** Módulos encendidos de un cliente. */
export async function entitlementsDe(c: PoolClient, clienteId: string): Promise<Set<string>> {
  const r = await c.query(
    "select modulo from plataforma.entitlements where cliente_id=$1 and encendido=true", [clienteId]);
  return new Set(r.rows.map((x) => x.modulo as string));
}
