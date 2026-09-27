import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

let _pool: Pool | null = null;

/**
 * Contexto de cliente por petición. conCliente lo fija durante la ejecución de fn,
 * así cualquier código dentro (p.ej. una llamada a la IA) puede saber a qué cliente
 * atribuir sin pasar el clienteId por toda la cadena de firmas. Propaga por async/await.
 */
const alsCliente = new AsyncLocalStorage<string>();
export function clienteActual(): string | null { return alsCliente.getStore() ?? null; }

export function pool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está definida");
    _pool = new Pool({ connectionString: url, max: 10 });
  }
  return _pool;
}

export async function cerrarPool(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = null; }
}

/**
 * Ejecuta `fn` con el cliente (tenant) fijado para toda la transacción.
 * La RLS lee `app.cliente_id` de la sesión. Es EL único camino para escribir
 * datos de negocio. Ver ADR 0003.
 */
export async function conCliente<T>(
  clienteId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    // Corre como el rol de aplicación NO superusuario: si no, un superusuario
    // IGNORA la RLS aunque esté forzada, y el aislamiento sería una mentira.
    // SET LOCAL se revierte al terminar la transacción.
    await c.query("set local role xhub_app");
    // set_config local: vive solo dentro de esta transacción
    await c.query("select set_config('app.cliente_id', $1, true)", [clienteId]);
    const r = await alsCliente.run(clienteId, () => fn(c));
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

/** Para operaciones de plataforma (cross-cliente), sin fijar cliente. */
export async function conPlataforma<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
