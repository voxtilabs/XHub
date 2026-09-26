import { test, expect } from "vitest";
import { RegistroModulos, permisosDe, puede, type Modulo } from "../src/index.js";

const mod = (nombre: string, permisos: string[], nucleo = false): Modulo =>
  ({ manifiesto: { nombre, depende: [], permisos, eventos: [], nucleo } });

function reg() {
  const r = new RegistroModulos();
  r.registrar(mod("nucleo", ["nucleo.leer"], true));
  r.registrar(mod("tickets", ["tickets.leer", "tickets.crear", "tickets.manage"]));
  r.registrar(mod("crm", ["crm.leer", "crm.manage"]));
  r.validar();
  return r;
}

test("ADMIN de un cliente con solo tickets NO obtiene permisos de crm", () => {
  const r = reg();
  const ps = permisosDe({ rol: "ADMIN", entitlements: new Set(["tickets"]) }, r);
  expect(ps.has("tickets.manage")).toBe(true);
  expect(ps.has("crm.leer")).toBe(false); // crm apagado → sus permisos no existen
});

test("apagar un módulo retira sus permisos sin tocar el rol", () => {
  const r = reg();
  const con = permisosDe({ rol: "ADMIN", entitlements: new Set(["tickets", "crm"]) }, r);
  const sin = permisosDe({ rol: "ADMIN", entitlements: new Set(["tickets"]) }, r);
  expect(con.has("crm.manage")).toBe(true);
  expect(sin.has("crm.manage")).toBe(false);
});

test("SUPERVISOR no obtiene .manage", () => {
  const r = reg();
  const ps = permisosDe({ rol: "SUPERVISOR", entitlements: new Set(["tickets"]) }, r);
  expect(ps.has("tickets.crear")).toBe(true);
  expect(ps.has("tickets.manage")).toBe(false);
});

test("USER solo lo básico", () => {
  const r = reg();
  const ps = permisosDe({ rol: "USER", entitlements: new Set(["tickets"]) }, r);
  expect(ps.has("tickets.leer")).toBe(true);
  expect(ps.has("tickets.crear")).toBe(true);
  expect(ps.has("tickets.manage")).toBe(false);
});

test("puede() responde por permiso, nunca por rol", () => {
  const r = reg();
  const a = { rol: "USER" as const, entitlements: new Set(["tickets"]) };
  expect(puede(a, "tickets.leer", r)).toBe(true);
  expect(puede(a, "tickets.manage", r)).toBe(false);
});
