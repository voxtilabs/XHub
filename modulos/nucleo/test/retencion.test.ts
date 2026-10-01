import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, auditar, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { purgarRetencion } from "../src/retencion.js";
import { join } from "node:path";

let A = "", keyVieja = "", keyNueva = "";

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Retención SA"))).id;
  keyVieja = `clientes/${A}/ticket/t1/vieja.pdf`;
  keyNueva = `clientes/${A}/ticket/t1/nueva.pdf`;
  // Un adjunto ATRASADO (400 días) y uno FRESCO (hoy). El creado_en se fija explícito.
  await conCliente(A, async (c) => {
    await c.query(
      `insert into nucleo.adjuntos (cliente_id, key, nombre, objeto_tipo, objeto_id, creado_en)
       values ($1,$2,'vieja.pdf','ticket','t1', now() - interval '400 days')`, [A, keyVieja]);
    await c.query(
      `insert into nucleo.adjuntos (cliente_id, key, nombre, objeto_tipo, objeto_id, creado_en)
       values ($1,$2,'nueva.pdf','ticket','t1', now())`, [A, keyNueva]);
  });
  // Excepción de retención del cliente: 30 días (plan ilimitado → rige la excepción).
  await conPlataforma((c) => c.query("update plataforma.clientes set retencion_dias=30 where id=$1", [A]));
});
afterAll(async () => { await cerrarPool(); });

test("dry: cuenta lo que borraría sin tocar nada", async () => {
  const r = await purgarRetencion({ dry: true });
  expect(r.adjuntosBorrados).toBeGreaterThanOrEqual(1);
  // nada se borró: las dos filas siguen
  const n = await conCliente(A, (c) => c.query("select count(*)::int n from nucleo.adjuntos where cliente_id=$1", [A]));
  expect(n.rows[0].n).toBe(2);
});

test("borra lo viejo, deja lo nuevo, y recoge→borra exactamente esas llaves (sin huérfanos)", async () => {
  const borradas: string[] = [];
  const r = await purgarRetencion({}, {
    conCliente, conPlataforma, auditar,
    eliminar: async (_cid, key) => { borradas.push(key); }, // espía: registra las llaves purgadas
  });
  expect(r.objetosFallidos).toBe(0);
  // la fila vieja se fue; la nueva quedó
  const filas = await conCliente(A, (c) => c.query("select key from nucleo.adjuntos where cliente_id=$1", [A]));
  const keys = filas.rows.map((x) => x.key as string);
  expect(keys).toContain(keyNueva);
  expect(keys).not.toContain(keyVieja);
  // el objeto S3 de la fila borrada se mandó a borrar (llaves recogidas = llaves eliminadas)
  expect(borradas).toContain(keyVieja);
  expect(borradas).not.toContain(keyNueva);
});

test("auditoría: queda UNA entrada de retencion.ejecutada por corrida", async () => {
  const antes = Number((await conPlataforma((c) => c.query(
    "select count(*)::int n from nucleo.auditoria where accion='retencion.ejecutada'"))).rows[0].n);
  await purgarRetencion({}, { conCliente, conPlataforma, auditar, eliminar: async () => {} });
  const desp = Number((await conPlataforma((c) => c.query(
    "select count(*)::int n from nucleo.auditoria where accion='retencion.ejecutada'"))).rows[0].n);
  expect(desp).toBe(antes + 1);
});
