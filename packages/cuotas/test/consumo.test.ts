import { test, expect, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import { registrarUso, consumoDelDia, diaNegocio, cerrarRedis } from "../src/index.js";

const r = new Redis(process.env.REDIS_URL!);
beforeEach(async () => { const ks = await r.keys("consumo:*"); if (ks.length) await r.del(...ks); });
afterAll(async () => { await r.quit(); await cerrarRedis(); });

test("día de negocio es America/Santiago", () => {
  expect(diaNegocio(new Date("2026-09-25T02:30:00Z"))).toBe("2026-09-24"); // 23:30 en Chile
});

test("registra uso y lo agrega por ruta", async () => {
  await registrarUso("cli1", "/v1/personas");
  await registrarUso("cli1", "/v1/personas");
  await registrarUso("cli1", "/v1/tickets");
  const c = await consumoDelDia("cli1");
  expect(c.total).toBe(3);
  expect(c.porRuta["/v1/personas"]).toBe(2);
  expect(c.porRuta["/v1/tickets"]).toBe(1);
});

test("el consumo persiste tras reconectar", async () => {
  await registrarUso("cli2", "/v1/x");
  const c = await consumoDelDia("cli2");
  expect(c.total).toBe(1);
});
