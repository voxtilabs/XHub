import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { fijarEntitlement } from "../src/entitlements.js";
import { crearLlave } from "../src/apikeys.js";
import { autenticarApi, exigirScope } from "../src/guard-api.js";
import { join } from "node:path";

let A = "", tokTickets = "", tokAmbos = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "API SA"))).id;
  await conPlataforma((c) => fijarEntitlement(c, A, "tickets", true));
  // llave que declara scopes de tickets Y crm, pero el cliente solo tiene tickets
  tokTickets = (await conPlataforma((c) => crearLlave(c, A, "solo tickets", ["tickets.leer"]))).token;
  tokAmbos = (await conPlataforma((c) => crearLlave(c, A, "pide crm también", ["tickets.leer", "crm.leer"]))).token;
});
afterAll(async () => { await cerrarPool(); });

test("el contexto sale de la llave: cliente, scopes y entitlements", async () => {
  const ctx = await conPlataforma((c) => autenticarApi(c, tokTickets));
  expect(ctx.clienteId).toBe(A);
  expect(ctx.scopes).toContain("tickets.leer");
  expect(ctx.entitlements.has("tickets")).toBe(true);
});

test("un scope de módulo APAGADO no vale, aunque la llave lo declare (techo por entitlement)", async () => {
  const ctx = await conPlataforma((c) => autenticarApi(c, tokAmbos));
  // la llave pide crm.leer pero el cliente no tiene crm encendido
  expect(ctx.scopes).toContain("tickets.leer");
  expect(ctx.scopes).not.toContain("crm.leer"); // recortado por el techo
  expect(() => exigirScope(ctx, "crm.leer")).toThrow(/no está habilitado/);
});

test("encender crm después habilita su scope sin recrear la llave", async () => {
  await conPlataforma((c) => fijarEntitlement(c, A, "crm", true));
  const ctx = await conPlataforma((c) => autenticarApi(c, tokAmbos));
  expect(ctx.scopes).toContain("crm.leer"); // ahora sí, en la petición siguiente
  expect(() => exigirScope(ctx, "crm.leer")).not.toThrow();
});

test("exigirScope niega un scope no declarado por la llave", async () => {
  const ctx = await conPlataforma((c) => autenticarApi(c, tokTickets));
  expect(() => exigirScope(ctx, "tickets.manage")).toThrow(/scope/);
});
