import { test, expect } from "vitest";
import { leerConfig, iniciar } from "../src/index.js";

test("sin variables, la telemetría queda inerte pero usable", async () => {
  const t = await iniciar(leerConfig({} as NodeJS.ProcessEnv));
  expect(t.activa).toBe(false);
  // no lanza aunque esté apagada
  expect(() => t.capturarError(new Error("x"))).not.toThrow();
  expect(t.nuevoRequestId()).toMatch(/^req_/);
});

test("con DSN se considera activa (aunque la lib no esté instalada, degrada sin romper)", async () => {
  const t = await iniciar(leerConfig({ SENTRY_DSN: "https://x@ejemplo/1" } as unknown as NodeJS.ProcessEnv));
  expect(t.activa).toBe(true);
  expect(() => t.capturarError(new Error("x"))).not.toThrow();
});

test("request ids son distintos", async () => {
  const t = await iniciar();
  expect(t.nuevoRequestId()).not.toBe(t.nuevoRequestId());
});

test("leerConfig toma el entorno y servicio del env", () => {
  const c = leerConfig({ XHUB_ENV: "staging", XHUB_SERVICIO: "workers" } as unknown as NodeJS.ProcessEnv);
  expect(c.entorno).toBe("staging");
  expect(c.servicio).toBe("workers");
});
