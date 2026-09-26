import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { pool, cerrarPool, conCliente, conPlataforma } from "../src/pool.js";
import { cargarDe, migrar } from "../src/migraciones.js";
import { join } from "node:path";

const migDir = join(__dirname, "..", "migrations");
let clienteA = "";
let clienteB = "";

beforeAll(async () => {
  // migrar como el dueño (admin) — DDL
  await migrar(cargarDe(migDir));
  // asegurar que el rol de app puede autenticarse para las pruebas de RLS
  await pool().query(
    "do $$ begin alter role xhub_app login password 'apppass'; exception when others then null; end $$;",
  );
  // sembrar dos clientes
  await conPlataforma(async (c) => {
    clienteA = (await c.query(
      "insert into plataforma.clientes(nombre,estado) values('A','activo') returning id",
    )).rows[0].id;
    clienteB = (await c.query(
      "insert into plataforma.clientes(nombre,estado) values('B','activo') returning id",
    )).rows[0].id;
  });
  await conCliente(clienteA, (c) =>
    c.query("insert into nucleo.notas_demo(cliente_id,texto) values($1,'de A')", [clienteA]),
  );
  await conCliente(clienteB, (c) =>
    c.query("insert into nucleo.notas_demo(cliente_id,texto) values($1,'de B')", [clienteB]),
  );
});

afterAll(async () => { await cerrarPool(); });

// Cliente conectado con el ROL DE APLICACIÓN (no superusuario) — es contra este
// que la RLS tiene efecto.
async function comoApp(clienteId: string | null, sql: string) {
  const url = new URL(process.env.DATABASE_URL!);
  const c = new Client({
    host: url.hostname, port: Number(url.port), database: url.pathname.slice(1),
    user: "xhub_app", password: "apppass",
  });
  await c.connect();
  try {
    await c.query("begin");
    if (clienteId) await c.query("select set_config('app.cliente_id',$1,true)", [clienteId]);
    const r = await c.query(sql);
    await c.query("commit");
    return r;
  } finally { await c.end(); }
}

describe("RLS aísla por cliente", () => {
  test("el rol de app solo ve lo de su cliente", async () => {
    const rA = await comoApp(clienteA, "select texto from nucleo.notas_demo");
    expect(rA.rows.map((r) => r.texto)).toEqual(["de A"]);
    const rB = await comoApp(clienteB, "select texto from nucleo.notas_demo");
    expect(rB.rows.map((r) => r.texto)).toEqual(["de B"]);
  });

  test("sin cliente fijado, el rol de app no ve nada", async () => {
    const r = await comoApp(null, "select texto from nucleo.notas_demo");
    expect(r.rows).toEqual([]);
  });

  test("el rol de app NO es superusuario ni bypassrls (si no, la RLS es mentira)", async () => {
    const r = await pool().query(
      "select rolsuper, rolbypassrls from pg_roles where rolname='xhub_app'",
    );
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });
});

describe("la prueba sirve: como superusuario la RLS NO aísla", () => {
  test("el dueño superusuario sin cliente ve TODO (por eso la app no debe ser super)", async () => {
    // pool() usa el usuario 'xhub' del DATABASE_URL, que es superusuario/owner.
    const r = await pool().query("select count(*)::int n from nucleo.notas_demo");
    expect(r.rows[0].n).toBeGreaterThanOrEqual(2); // ve las de A y B a la vez
  });
});
