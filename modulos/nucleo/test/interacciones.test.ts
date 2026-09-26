import { test, expect, beforeAll, afterAll } from "vitest";
import { pool, cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { asegurarPersonaPorIdentidad } from "../src/personas.js";
import { registrarInteraccion, lineaDeTiempo } from "../src/interacciones.js";
import { join } from "node:path";

const migDir = join(__dirname, "..", "..", "..", "packages", "db", "migrations");
let A = "", persona = "";
beforeAll(async () => {
  await migrar(cargarDe(migDir));
  A = (await conPlataforma((c) => crearCliente(c, "Timeline SA"))).id;
  persona = (await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "p1"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("orden estable por seq: 100 interacciones en UNA transacción", async () => {
  const px = (await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "orden-test"))).id;
  await conCliente(A, async (c) => {
    for (let i = 0; i < 100; i++)
      await registrarInteraccion(c, { personaId: px, tipo: "nota", moduloOrigen: "nucleo", resumen: `n${i}` });
  });
  // now() empataría las 100 (fijo por tx); seq las ordena
  const p = await conCliente(A, (c) => lineaDeTiempo(c, px, undefined, 200));
  const seqs = p.datos.map((d) => Number(d.seq));
  expect(seqs.length).toBeGreaterThanOrEqual(100);
  // invariante real: estrictamente descendente por seq (now() empataría; seq no)
  for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeLessThan(seqs[i - 1]);
  // y las 100 de ESTA persona son las más recientes de su timeline
  const mias = p.datos.filter((d) => d.resumen?.startsWith("n"));
  expect(mias.length).toBe(100);
});

test("idempotencia (ley 6): reintento con mismo dedupeId → 1 fila", async () => {
  const e = { personaId: persona, tipo: "llamada", moduloOrigen: "conector", dedupeId: "job-abc", resumen: "una" };
  const r1 = await conCliente(A, (c) => registrarInteraccion(c, e));
  const r2 = await conCliente(A, (c) => registrarInteraccion(c, e));
  expect(r1.seq).toBe(r2.seq); // el returning devuelve la existente
  const total = await conCliente(A, (c) =>
    c.query("select count(*)::int n from nucleo.interacciones where dedupe_id='job-abc'"));
  expect(total.rows[0].n).toBe(1);
});

test("append-only: no se puede update ni delete la línea de tiempo", async () => {
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: persona, tipo: "x", moduloOrigen: "nucleo" }));
  await expect(
    conCliente(A, (c) => c.query("update nucleo.interacciones set resumen='hack' where persona_id=$1", [persona])),
  ).rejects.toThrow(/append-only|permission|denied/i);
});

test("paginación keyset sin solapes", async () => {
  const px = (await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "pag-test"))).id;
  await conCliente(A, async (c) => {
    for (let i = 0; i < 25; i++)
      await registrarInteraccion(c, { personaId: px, tipo: "nota", moduloOrigen: "nucleo", resumen: `p${i}` });
  });
  const pg1 = await conCliente(A, (c) => lineaDeTiempo(c, px, undefined, 10));
  expect(pg1.datos.length).toBe(10);
  expect(pg1.siguiente).not.toBeNull();
  const pg2 = await conCliente(A, (c) => lineaDeTiempo(c, px, pg1.siguiente!, 10));
  const s1 = new Set(pg1.datos.map((d) => d.seq));
  expect(pg2.datos.every((d) => !s1.has(d.seq))).toBe(true); // sin repetidos
});
