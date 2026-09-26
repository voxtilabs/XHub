import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { fijarEntitlement, entitlementsDe } from "../src/entitlements.js";
import { crearLlave, resolverLlave, revocarLlave } from "../src/apikeys.js";
import { join } from "node:path";

let A = "", B = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Cli A"))).id;
  B = (await conPlataforma((c) => crearCliente(c, "Cli B"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("encender y apagar módulos por cliente", async () => {
  await conPlataforma((c) => fijarEntitlement(c, A, "tickets", true));
  await conPlataforma((c) => fijarEntitlement(c, A, "crm", true));
  let e = await conPlataforma((c) => entitlementsDe(c, A));
  expect(e.has("tickets")).toBe(true);
  expect(e.has("crm")).toBe(true);
  // apagar crm
  await conPlataforma((c) => fijarEntitlement(c, A, "crm", false));
  e = await conPlataforma((c) => entitlementsDe(c, A));
  expect(e.has("tickets")).toBe(true);
  expect(e.has("crm")).toBe(false); // apagado
});

test("un cliente con solo tickets no tiene crm", async () => {
  await conPlataforma((c) => fijarEntitlement(c, B, "tickets", true));
  const e = await conPlataforma((c) => entitlementsDe(c, B));
  expect([...e]).toEqual(["tickets"]);
});

test("la llave se muestra una vez; solo el hash se guarda", async () => {
  const l = await conPlataforma((c) => crearLlave(c, A, "integración ERP"));
  expect(l.token).toMatch(/^xhub_/);
  const guardado = await conPlataforma((c) =>
    c.query("select hash, prefijo from plataforma.api_keys where id=$1", [l.id]));
  expect(guardado.rows[0].hash).not.toBe(l.token); // no está en claro
  expect(guardado.rows[0].hash.length).toBe(64);   // sha256
  expect(l.token.startsWith(guardado.rows[0].prefijo)).toBe(true);
});

test("EL CLIENTE SALE DE LA LLAVE, no de un header (cruzar clientes imposible)", async () => {
  const lA = await conPlataforma((c) => crearLlave(c, A, "de A"));
  const lB = await conPlataforma((c) => crearLlave(c, B, "de B"));
  const rA = await conPlataforma((c) => resolverLlave(c, lA.token));
  const rB = await conPlataforma((c) => resolverLlave(c, lB.token));
  expect(rA.clienteId).toBe(A);
  expect(rB.clienteId).toBe(B);
  expect(rA.clienteId).not.toBe(rB.clienteId); // cada llave a su cliente, sin ambigüedad
});

test("una llave revocada ya no resuelve", async () => {
  const l = await conPlataforma((c) => crearLlave(c, A, "temporal"));
  await conPlataforma((c) => revocarLlave(c, l.id));
  await expect(conPlataforma((c) => resolverLlave(c, l.token)))
    .rejects.toMatchObject({ codigo: "NO_AUTENTICADO" });
});

test("un token inventado no resuelve", async () => {
  await expect(conPlataforma((c) => resolverLlave(c, "xhub_inventado")))
    .rejects.toMatchObject({ codigo: "NO_AUTENTICADO" });
  await expect(conPlataforma((c) => resolverLlave(c, "sin-prefijo")))
    .rejects.toMatchObject({ codigo: "NO_AUTENTICADO" });
});
