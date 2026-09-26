import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { pool } from "./pool.js";

export interface Migracion {
  id: string;          // "0000_plataforma_base"
  modulo: string;      // "plataforma", "nucleo", "tickets"...
  depende: string[];   // módulos de los que depende
  sql: string;
}

/** Ordena por dependencias de módulo (topológico). Un ciclo aborta. */
export function ordenar(migs: Migracion[]): Migracion[] {
  const porModulo = new Map<string, Migracion[]>();
  for (const m of migs) {
    if (!porModulo.has(m.modulo)) porModulo.set(m.modulo, []);
    porModulo.get(m.modulo)!.push(m);
  }
  const visto = new Set<string>();
  const enCurso = new Set<string>();
  const orden: string[] = [];
  const visitar = (mod: string, cadena: string[]) => {
    if (visto.has(mod)) return;
    if (enCurso.has(mod))
      throw new Error(`Ciclo de dependencias entre módulos: ${[...cadena, mod].join(" → ")}`);
    enCurso.add(mod);
    const deps = new Set((porModulo.get(mod) ?? []).flatMap((m) => m.depende));
    for (const d of deps) {
      if (!porModulo.has(d)) throw new Error(`El módulo "${mod}" depende de "${d}", que no existe`);
      visitar(d, [...cadena, mod]);
    }
    enCurso.delete(mod);
    visto.add(mod);
    orden.push(mod);
  };
  for (const mod of porModulo.keys()) visitar(mod, []);
  const out: Migracion[] = [];
  for (const mod of orden)
    out.push(...(porModulo.get(mod) ?? []).sort((a, b) => a.id.localeCompare(b.id)));
  return out;
}

/** Lee migraciones de un directorio: NNNN_modulo_nombre.sql con cabecera opcional -- depende: a,b */
export function cargarDe(dir: string): Migracion[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      const id = f.replace(/\.sql$/, "");
      const modulo = id.split("_")[1] ?? "sin-modulo";
      const dep = sql.match(/^--\s*depende:\s*(.+)$/m);
      const depende = dep ? dep[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
      return { id, modulo, depende, sql };
    });
}

/** Aplica las migraciones pendientes, en orden, cada una en su transacción. Idempotente. */
export async function migrar(migs: Migracion[]): Promise<string[]> {
  const p = pool();
  await p.query(`create table if not exists _migraciones (
    id text primary key, aplicada_en timestamptz not null default now())`);
  const yaSet = new Set(
    (await p.query("select id from _migraciones")).rows.map((r) => r.id as string),
  );
  const aplicadas: string[] = [];
  for (const m of ordenar(migs)) {
    if (yaSet.has(m.id)) continue;
    const c: PoolClient = await p.connect();
    try {
      await c.query("begin");
      await c.query(m.sql);
      await c.query("insert into _migraciones(id) values ($1)", [m.id]);
      await c.query("commit");
      aplicadas.push(m.id);
    } catch (e) {
      await c.query("rollback");
      throw new Error(`Migración ${m.id} falló: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }
  return aplicadas;
}
