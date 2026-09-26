import { test, expect, afterAll } from "vitest";
import { crearCola, crearWorkerDeModulo, nombreCola } from "../src/index.js";

const abiertos: { close: () => Promise<void> }[] = [];
afterAll(async () => { for (const x of abiertos) await x.close(); });

test("nombreCola aísla por módulo", () => {
  expect(nombreCola("tickets", "inbound")).toBe("tickets.inbound");
});

test("un job encolado se procesa", async () => {
  const cola = crearCola("prueba", "eco"); abiertos.push(cola);
  let visto: unknown = null;
  const w = crearWorkerDeModulo("prueba", "eco", async (job) => { visto = job.data; return "ok"; });
  abiertos.push(w);
  await cola.add("uno", { valor: 42 });
  // esperar a que el worker lo tome
  await new Promise((r) => {
    const t = setInterval(() => { if (visto) { clearInterval(t); r(null); } }, 50);
  });
  expect(visto).toEqual({ valor: 42 });
});

test("un job que falla queda en la cola de muertos (failed), no se borra", async () => {
  const cola = crearCola("prueba", "cae"); abiertos.push(cola);
  const w = crearWorkerDeModulo("prueba", "cae", async () => { throw new Error("causa legible"); }, 1);
  abiertos.push(w);
  // 1 intento para que falle rápido en el test
  await cola.add("malo", { x: 1 }, { attempts: 1 });
  await new Promise((r) => setTimeout(r, 1500));
  const fallidos = await cola.getFailed();
  expect(fallidos.length).toBeGreaterThan(0);
  expect(fallidos[0].failedReason).toContain("causa legible");
}, 10000);
