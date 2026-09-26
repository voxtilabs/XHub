import { test, expect, vi } from "vitest";
import { leerConfig, iniciar } from "../src/index.js";

test("sin variables, la telemetría queda inerte pero usable", async () => {
  const t = await iniciar(leerConfig({} as NodeJS.ProcessEnv));
  expect(t.activa).toBe(false);
  expect(() => t.capturarError(new Error("x"))).not.toThrow();
  expect(t.nuevoRequestId()).toMatch(/^req_/);
});

test("Sentry NO se activa aunque haya un DSN en el entorno (lo paga X5, pospuesto)", async () => {
  const t = await iniciar(leerConfig({ SENTRY_DSN: "https://x@ejemplo/1" } as unknown as NodeJS.ProcessEnv));
  // un DSN no debe activar nada: Sentry está pospuesto por decisión de negocio
  expect(t.activa).toBe(false);
});

test("capturarError registra localmente, sin servicio externo", async () => {
  const t = await iniciar();
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  t.capturarError(new Error("falla"), { req: "1" });
  expect(spy).toHaveBeenCalled();
  const linea = String(spy.mock.calls[0][0]);
  expect(linea).toContain("falla");
  spy.mockRestore();
});

test("OTel sí puede activarse por su endpoint (no cuesta como Sentry)", async () => {
  const t = await iniciar(leerConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" } as unknown as NodeJS.ProcessEnv));
  expect(t.activa).toBe(true);
});
