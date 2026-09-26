import { test, expect, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import { rateLimit, consumirCuota, exigirCuota, usoDelMes, mesNegocio, cerrarRedis } from "../src/index.js";

const r = new Redis(process.env.REDIS_URL!);
beforeEach(async () => { const ks = await r.keys("rl:*"); const cs = await r.keys("cuota:*"); const hs = await r.keys("hito:*"); if ([...ks,...cs,...hs].length) await r.del(...ks, ...cs, ...hs); });
afterAll(async () => { await r.quit(); await cerrarRedis(); });

test("mes de negocio es America/Santiago como AAAA-MM", () => {
  // 1 oct 2026 00:30 UTC = 30 sep 21:30 en Chile → mes 09, no 10
  expect(mesNegocio(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09");
});

test("rate limit por minuto: permite hasta el tope y luego niega", async () => {
  const ahora = new Date("2026-09-24T12:00:00Z");
  let ultimo;
  for (let i = 0; i < 5; i++) ultimo = await rateLimit("k1", 3, ahora);
  expect(ultimo!.permitido).toBe(false); // el 4º y 5º ya no
  const r3 = await rateLimit("k2", 3, ahora);
  expect(r3.permitido).toBe(true);
  expect(r3.restante).toBe(2);
});

test("cuota mensual: consume y agota", async () => {
  const cl = "cliente-cuota";
  for (let i = 0; i < 10; i++) await consumirCuota(cl, 10);
  expect(await usoDelMes(cl)).toBe(10);
  const extra = await consumirCuota(cl, 10);
  expect(extra.permitido).toBe(false); // 11 > 10
});

test("aviso al 80% y al 100%, una sola vez cada uno", async () => {
  const cl = "cliente-aviso";
  const avisos: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await consumirCuota(cl, 10);
    if (r.aviso) avisos.push(r.aviso);
  }
  // 80% se cruza en el consumo 8, 100% en el 10 — cada uno una vez
  expect(avisos.filter((a) => a === "ochenta").length).toBe(1);
  expect(avisos.filter((a) => a === "cien").length).toBe(1);
});

test("exigirCuota lanza 429 al agotarse", async () => {
  const cl = "cliente-429";
  await consumirCuota(cl, 1); // usado=1, permitido
  await expect(exigirCuota(cl, 1)).rejects.toMatchObject({ codigo: "CUOTA_EXCEDIDA" });
});
