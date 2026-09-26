import { test, expect } from "vitest";
import { RegistroModulos, type Modulo } from "../src/index.js";

const mod = (nombre: string, depende: string[] = [], permisos: string[] = [], nucleo = false): Modulo =>
  ({ manifiesto: { nombre, depende, permisos, eventos: [], nucleo } });

test("registra y valida un grafo sano", () => {
  const r = new RegistroModulos();
  r.registrar(mod("plataforma", [], [], true));
  r.registrar(mod("nucleo", ["plataforma"], ["nucleo.leer"], true));
  r.registrar(mod("tickets", ["nucleo"], ["tickets.crear"]));
  expect(() => r.validar()).not.toThrow();
  expect(r.lista().length).toBe(3);
});

test("nombre duplicado aborta", () => {
  const r = new RegistroModulos();
  r.registrar(mod("a"));
  expect(() => r.registrar(mod("a"))).toThrow(/duplicado/);
});

test("dependencia inexistente aborta", () => {
  const r = new RegistroModulos();
  r.registrar(mod("tickets", ["fantasma"]));
  expect(() => r.validar()).toThrow(/no está registrado/);
});

test("un ciclo aborta", () => {
  const r = new RegistroModulos();
  r.registrar(mod("a", ["b"]));
  r.registrar(mod("b", ["a"]));
  expect(() => r.validar()).toThrow(/Ciclo/);
});

test("permiso declarado por dos módulos aborta", () => {
  const r = new RegistroModulos();
  r.registrar(mod("a", [], ["comun.x"]));
  r.registrar(mod("b", [], ["comun.x"]));
  expect(() => r.validar()).toThrow(/declarado por/);
});

test("un cliente sin entitlement NO ve el módulo apagable, pero sí el núcleo", () => {
  const r = new RegistroModulos();
  r.registrar(mod("nucleo", [], [], true));
  r.registrar(mod("crm", ["nucleo"]));
  r.registrar(mod("tickets", ["nucleo"]));
  const activos = r.activosPara(new Set(["tickets"]));
  expect(activos).toContain("nucleo");   // el núcleo siempre
  expect(activos).toContain("tickets");  // entitlement presente
  expect(activos).not.toContain("crm");  // sin entitlement, no existe para él
});
