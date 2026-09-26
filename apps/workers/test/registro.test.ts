import { test, expect } from "vitest";
import { construirRegistro } from "../src/registro.js";

test("el registro lista los consumidores del outbox, con tipos e ids estables", () => {
  const reg = construirRegistro();
  const tipos = reg.map((r) => r.tipo);
  // los eventos que hoy tienen un consumidor conectado
  expect(tipos).toContain("persona.suprimida");
  expect(tipos).toContain("conversacion.terminada");
  // cada entrada trae un manejador
  expect(reg.every((r) => typeof r.manejar === "function")).toBe(true);
  // ids de consumidor únicos (la entrega única depende de que no colisionen)
  const ids = reg.map((r) => r.consumidor);
  expect(new Set(ids).size).toBe(ids.length);
});
