import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { fijarEntitlement } from "../src/entitlements.js";
import { asegurarPersonaPorIdentidad } from "../src/personas.js";
import { enlacesDe } from "../src/enlaces.js";
import { crearRegla, activarRegla, aplicarReglas, aQuienAfectaria } from "../src/reglas.js";
import { join } from "node:path";

let A = "", persona = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Reglas SA"))).id;
  await conPlataforma((c) => fijarEntitlement(c, A, "crm", true));
  persona = (await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "cli@x.cl"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("una regla nace APAGADA", async () => {
  const id = await conCliente(A, (c) => crearRegla(c, {
    nombre: "ticket→crm", evento: "ticket.creado",
    condicion: {}, accion: { tipo: "enlazar_a_oportunidad" }, moduloDestino: "crm" }));
  const r = await conCliente(A, (c) => c.query("select activa from nucleo.reglas where id=$1", [id]));
  expect(r.rows[0].activa).toBe(false);
});

test("EL TICKET QUEDA EN EL CRM: la regla activa enlaza ticket→oportunidad", async () => {
  const id = await conCliente(A, (c) => crearRegla(c, {
    nombre: "postventa", evento: "ticket.creado",
    condicion: {}, accion: { tipo: "enlazar_a_oportunidad" }, moduloDestino: "crm" }));
  await conCliente(A, (c) => activarRegla(c, id, true));
  const res = await conCliente(A, (c) => aplicarReglas(c, { tipo: "ticket.creado", objetoId: "TK-1", personaId: persona }));
  expect(res.some((r) => r.resultado === "ok")).toBe(true);
  // el ticket quedó enlazado a una oportunidad
  const enl = await conCliente(A, (c) => enlacesDe(c, "ticket", "TK-1"));
  expect(enl.some((e) => e.destino_tipo === "oportunidad")).toBe(true);
});

test("idempotente: reintentar el mismo evento no duplica", async () => {
  const id = await conCliente(A, (c) => crearRegla(c, {
    nombre: "unica", evento: "ticket.creado", condicion: {}, accion: { tipo: "enlazar_a_oportunidad" }, moduloDestino: "crm" }));
  await conCliente(A, (c) => activarRegla(c, id, true));
  await conCliente(A, (c) => aplicarReglas(c, { tipo: "ticket.creado", objetoId: "TK-9", personaId: persona }));
  const segunda = await conCliente(A, (c) => aplicarReglas(c, { tipo: "ticket.creado", objetoId: "TK-9", personaId: persona }));
  // esta regla en la segunda pasada devuelve ya_ejecutada
  expect(segunda.find((r) => r.reglaId === id)?.resultado).toBe("ya_ejecutada");
});

test("módulo destino APAGADO → la regla queda pausada, no falla", async () => {
  const B = (await conPlataforma((c) => crearCliente(c, "Sin CRM SA"))).id; // sin entitlement crm
  const pB = (await conCliente(B, (c) => asegurarPersonaPorIdentidad(c, "email", "b@x.cl"))).id;
  const id = await conCliente(B, (c) => crearRegla(c, {
    nombre: "pausa", evento: "ticket.creado", condicion: {}, accion: { tipo: "enlazar_a_oportunidad" }, moduloDestino: "crm" }));
  await conCliente(B, (c) => activarRegla(c, id, true));
  const res = await conCliente(B, (c) => aplicarReglas(c, { tipo: "ticket.creado", objetoId: "TK-B", personaId: pB }));
  expect(res.find((r) => r.reglaId === id)?.resultado).toBe("pausada");
});

test("vista previa: a cuántos afectaría hoy", async () => {
  const id = await conCliente(A, (c) => crearRegla(c, {
    nombre: "preview", evento: "ticket.creado", condicion: {}, accion: { tipo: "registrar_nota", texto: "x" } }));
  const n = await conCliente(A, (c) => aQuienAfectaria(c, id, ["a", "b", "c"]));
  expect(n).toBe(3); // ninguno ejecutado aún
});
