import { test, expect } from "vitest";
import { validarDefinicion, type DefinicionModulo } from "../src/index.js";

const base: DefinicionModulo = {
  manifiesto: { nombre: "tickets", depende: ["nucleo"], permisos: ["tickets.leer", "tickets.crear"], eventos: [] },
  rutas: [{ metodo: "GET", ruta: "/", scope: "tickets.leer" }],
  consumidores: [{ tipo: "x", consumidor: "c1", manejar: async () => {} }],
};

test("una definición bien formada pasa", () => {
  expect(() => validarDefinicion(base)).not.toThrow();
});

test("sin nombre falla", () => {
  expect(() => validarDefinicion({ ...base, manifiesto: { ...base.manifiesto, nombre: "" } })).toThrow(/nombre/);
});

test("nombre reservado del núcleo falla", () => {
  for (const n of ["nucleo", "plataforma"])
    expect(() => validarDefinicion({ ...base, manifiesto: { ...base.manifiesto, nombre: n } })).toThrow(/reservado/);
});

test("scope de ruta que no está en permisos falla", () => {
  expect(() => validarDefinicion({ ...base, rutas: [{ metodo: "GET", ruta: "/", scope: "tickets.borrar" }] }))
    .toThrow(/no lista en permisos/);
});

test("consumidor duplicado falla", () => {
  expect(() => validarDefinicion({ ...base, consumidores: [
    { tipo: "x", consumidor: "dup", manejar: async () => {} },
    { tipo: "y", consumidor: "dup", manejar: async () => {} },
  ] })).toThrow(/duplicado/);
});
