import { test, expect } from "vitest";
import { retencionEfectiva } from "../src/retencion.js";

test("sin excepción, rige el plan", () => {
  expect(retencionEfectiva(365, null)).toBe(365);
  expect(retencionEfectiva(90, undefined)).toBe(90);
});

test("plan ilimitado: la excepción (finita) acorta", () => {
  expect(retencionEfectiva(null, 30)).toBe(30);
  expect(retencionEfectiva(null, null)).toBe(null); // ambos ilimitados → no se purga
});

test("la excepción nunca excede el techo del plan", () => {
  expect(retencionEfectiva(90, 30)).toBe(30);   // más corta: vale
  expect(retencionEfectiva(90, 365)).toBe(90);  // más larga: se recorta al techo
  expect(retencionEfectiva(90, 90)).toBe(90);
});

test("valores no-positivos se tratan como ilimitado (nunca «borra todo ya»)", () => {
  expect(retencionEfectiva(0, null)).toBe(null);
  expect(retencionEfectiva(-5, null)).toBe(null);
  expect(retencionEfectiva(90, 0)).toBe(90);    // excepción 0 = sin excepción → plan
  expect(retencionEfectiva(90, -1)).toBe(90);
});

test("redondea a días enteros", () => {
  expect(retencionEfectiva(30.9, null)).toBe(30);
  expect(retencionEfectiva(null, 7.5)).toBe(7);
});
