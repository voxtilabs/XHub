import { test, expect } from "vitest";
import { ErrorApi, aCuerpo, codificarCursor, decodificarCursor, armarPagina, exigir, RegistroModulos, type Modulo } from "../src/index.js";

test("ErrorApi mapea a HTTP y a cuerpo con código estable", () => {
  const { http, cuerpo } = aCuerpo(new ErrorApi("SIN_PERMISO", "no", { permiso: "x" }), "req1");
  expect(http).toBe(403);
  expect(cuerpo.error.codigo).toBe("SIN_PERMISO");
  expect(cuerpo.error.request_id).toBe("req1");
});

test("un error cualquiera NO filtra su mensaje crudo", () => {
  const { http, cuerpo } = aCuerpo(new Error("SELECT * FROM secretos falló en la línea 42"));
  expect(http).toBe(500);
  expect(cuerpo.error.codigo).toBe("INTERNO");
  expect(cuerpo.error.mensaje).not.toContain("SELECT");
});

test("cursor va y vuelve", () => {
  const c = codificarCursor(42);
  expect(decodificarCursor(c)).toBe("42");
  expect(decodificarCursor(undefined)).toBeNull();
  expect(decodificarCursor("basura!!")).toBeNull();
});

test("armarPagina indica siguiente solo si hay más", () => {
  const filas = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
  const p = armarPagina(filas, 2);
  expect(p.datos.length).toBe(2);
  expect(p.siguiente).not.toBeNull();
  const p2 = armarPagina([{ seq: 1 }], 2);
  expect(p2.siguiente).toBeNull();
});

test("exigir lanza SIN_PERMISO cuando falta el permiso", () => {
  const r = new RegistroModulos();
  const mod: Modulo = { manifiesto: { nombre: "tickets", depende: [], permisos: ["tickets.leer"], eventos: [] } };
  r.registrar(mod); r.validar();
  const actor = { rol: "USER" as const, entitlements: new Set(["tickets"]) };
  expect(() => exigir(actor, "tickets.leer", r)).not.toThrow();
  expect(() => exigir(actor, "tickets.manage", r)).toThrow(/permiso/);
});
