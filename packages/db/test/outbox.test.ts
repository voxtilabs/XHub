import { test, expect, beforeAll, afterAll } from "vitest";
import { pool, cerrarPool, conPlataforma } from "../src/pool.js";
import { cargarDe, migrar } from "../src/migraciones.js";
import { emitir, tomarPendientes, marcarParaConsumidor, marcarProcesado, pendientes } from "../src/outbox.js";
import { join } from "node:path";

beforeAll(async () => { await migrar(cargarDe(join(__dirname, "..", "migrations"))); });
afterAll(async () => { await cerrarPool(); });

test("un evento emitido en una transacción REVERTIDA no se entrega", async () => {
  const antes = await pendientes();
  const c = await pool().connect();
  try {
    await c.query("begin");
    await emitir(c, { modulo: "nucleo", tipo: "prueba.rollback" });
    await c.query("rollback"); // se revierte
  } finally { c.release(); }
  expect(await pendientes()).toBe(antes); // no sumó
});

test("un evento emitido y commiteado sí queda pendiente", async () => {
  await conPlataforma((c) => emitir(c, { modulo: "nucleo", tipo: "prueba.ok" }));
  expect(await pendientes()).toBeGreaterThan(0);
});

test("tomarPendientes salta los módulos apagados", async () => {
  await conPlataforma((c) => emitir(c, { modulo: "crm", tipo: "solo.crm" }));
  await conPlataforma(async (c) => {
    const soloNucleo = await tomarPendientes(c, ["nucleo"], 100);
    expect(soloNucleo.every((f) => f.modulo === "nucleo")).toBe(true);
    const conCrm = await tomarPendientes(c, ["nucleo", "crm"], 100);
    expect(conCrm.some((f) => f.modulo === "crm")).toBe(true);
  });
});

test("entrega única: el mismo evento no se procesa dos veces por consumidor", async () => {
  let id = "";
  await conPlataforma(async (c) => {
    await emitir(c, { modulo: "nucleo", tipo: "unico" });
    const f = await tomarPendientes(c, ["nucleo"], 100);
    id = f[f.length - 1].id;
  });
  const primera = await conPlataforma((c) => marcarParaConsumidor(c, id, "consumidorX"));
  const segunda = await conPlataforma((c) => marcarParaConsumidor(c, id, "consumidorX"));
  expect(primera).toBe(true);   // le tocó
  expect(segunda).toBe(false);  // ya lo hizo, no repite
});
