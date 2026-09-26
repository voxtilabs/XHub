import { test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { cerrarPool, conCliente, conPlataforma, migrar, cargarDe } from "../src/index.js";
import { emitir } from "../src/outbox.js";
import { despacharLote, listarMuertos, type ConsumidorEvento } from "../src/despachador.js";

let A = "";
async function nuevoCliente(nombre: string): Promise<string> {
  return (await conPlataforma((c) => c.query("insert into plataforma.clientes (nombre) values ($1) returning id", [nombre]))).rows[0].id;
}
async function emitirEvento(tipo: string, payload: Record<string, unknown>): Promise<void> {
  await conCliente(A, (c) => emitir(c, { clienteId: A, modulo: "prueba", tipo, payload }));
}

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "migrations")));
  A = await nuevoCliente("Despacho SA");
});
afterAll(async () => { await cerrarPool(); });

test("entrega un evento a su consumidor por tipo, EXACTAMENTE una vez", async () => {
  const vistos: number[] = [];
  const reg: ConsumidorEvento[] = [{ tipo: "prueba.uno", consumidor: "test:uno", manejar: async (_c, ev) => { vistos.push((ev.payload as any).n); } }];
  await emitirEvento("prueba.uno", { n: 7 });

  const r1 = await despacharLote(reg);
  expect(r1.procesados).toBe(1);
  expect(vistos).toEqual([7]);

  // segunda pasada: ya está procesado → ni se relee ni se vuelve a llamar al consumidor
  const r2 = await despacharLote(reg);
  expect(r2.leidos).toBe(0);
  expect(vistos).toEqual([7]);
});

test("dos consumidores del mismo tipo reciben el evento (fan-out), cada uno una vez", async () => {
  const a: string[] = [], b: string[] = [];
  const reg: ConsumidorEvento[] = [
    { tipo: "prueba.fanout", consumidor: "test:a", manejar: async () => { a.push("x"); } },
    { tipo: "prueba.fanout", consumidor: "test:b", manejar: async () => { b.push("x"); } },
  ];
  await emitirEvento("prueba.fanout", {});
  await despacharLote(reg);
  await despacharLote(reg);
  expect(a.length).toBe(1);
  expect(b.length).toBe(1);
});

test("un evento sin consumidor se marca procesado y no se relee", async () => {
  await emitirEvento("nadie.escucha", {});
  const r = await despacharLote([]); // registro vacío
  expect(r.sinConsumidor).toBeGreaterThanOrEqual(1);
  const r2 = await despacharLote([]);
  expect(r2.leidos).toBe(0);
});

test("un consumidor que falla reintenta, no marca procesado, y tras maxIntentos cae a la cola de muertos", async () => {
  let intentos = 0;
  const reg: ConsumidorEvento[] = [{ tipo: "prueba.falla", consumidor: "test:falla", manejar: async () => { intentos++; throw new Error("boom"); } }];
  await emitirEvento("prueba.falla", {});

  // maxIntentos=2 → se reintenta hasta que intentos llega a 2, luego deja de leerse
  await despacharLote(reg, { maxIntentos: 2 });  // intento 1
  await despacharLote(reg, { maxIntentos: 2 });  // intento 2 → alcanza el tope
  const r3 = await despacharLote(reg, { maxIntentos: 2 }); // ya no se lee
  expect(r3.leidos).toBe(0);
  expect(intentos).toBe(2);

  const muertos = await listarMuertos(2);
  expect(muertos.some((m) => m.tipo === "prueba.falla")).toBe(true);
});

test("filtra por módulos activos: un evento de un módulo apagado no se procesa", async () => {
  const vistos: string[] = [];
  const reg: ConsumidorEvento[] = [{ tipo: "prueba.modulo", consumidor: "test:mod", manejar: async () => { vistos.push("x"); } }];
  await emitirEvento("prueba.modulo", {}); // emitido por módulo "prueba"
  const r = await despacharLote(reg, { modulosActivos: ["nucleo", "tickets"] }); // "prueba" no está
  expect(r.leidos).toBe(0);
  expect(vistos.length).toBe(0);
  // con el módulo activo, sí se procesa
  const r2 = await despacharLote(reg, { modulosActivos: ["prueba"] });
  expect(r2.procesados).toBe(1);
  expect(vistos.length).toBe(1);
});
