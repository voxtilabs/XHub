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
  // La entrega única depende de que no colisione el par (tipo, consumidor): un mismo
  // consumidor (p.ej. nucleo:webhooks-salientes) puede atender VARIOS tipos a propósito;
  // lo que no puede haber es dos manejadores para el MISMO tipo+consumidor.
  const pares = reg.map((r) => `${r.tipo}|${r.consumidor}`);
  expect(new Set(pares).size).toBe(pares.length);
});
