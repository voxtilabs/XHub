import { test, expect } from "vitest";
import { ordenar, type Migracion } from "../src/migraciones.js";

const m = (id: string, modulo: string, depende: string[] = []): Migracion =>
  ({ id, modulo, depende, sql: "" });

test("ordena por dependencia de módulo", () => {
  const r = ordenar([
    m("0001_crm_x", "crm", ["nucleo"]),
    m("0000_nucleo_y", "nucleo", ["plataforma"]),
    m("0000_plataforma_z", "plataforma"),
  ]);
  const mods = r.map((x) => x.modulo);
  expect(mods.indexOf("plataforma")).toBeLessThan(mods.indexOf("nucleo"));
  expect(mods.indexOf("nucleo")).toBeLessThan(mods.indexOf("crm"));
});

test("un ciclo aborta con mensaje claro", () => {
  expect(() =>
    ordenar([m("0_a", "a", ["b"]), m("0_b", "b", ["a"])]),
  ).toThrow(/Ciclo/);
});

test("dependencia a un módulo inexistente aborta", () => {
  expect(() => ordenar([m("0_a", "a", ["fantasma"])])).toThrow(/no existe/);
});
