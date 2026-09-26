import { test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { crearApp } from "../src/app.js";
import { cerrarPool, conPlataforma, conCliente, cargarDe, migrar } from "@xhub/db";
import { crearCliente, fijarEntitlement, crearLlave } from "@xhub/modulo-nucleo";
import { cerrarRedis } from "@xhub/cuotas";
import { join } from "node:path";

let app: FastifyInstance, token = "", A = "";

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "API SA"))).id;
  await conPlataforma((c) => fijarEntitlement(c, A, "tickets", true));
  await conPlataforma((c) => fijarEntitlement(c, A, "nucleo", true));
  token = (await conPlataforma((c) => crearLlave(c, A, "demo", ["tickets.crear", "tickets.leer", "nucleo.leer"]))).token;
  app = crearApp();
  await app.ready();
});
afterAll(async () => { await app.close(); await cerrarPool(); await cerrarRedis(); });

test("/salud responde sin auth", async () => {
  const r = await app.inject({ method: "GET", url: "/salud" });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ ok: true });
});

test("sin llave → 401 con código estable y request-id", async () => {
  const r = await app.inject({ method: "GET", url: "/v1/tickets" });
  expect(r.statusCode).toBe(401);
  expect(r.json().error.codigo).toBe("NO_AUTENTICADO");
  expect(r.headers["x-request-id"]).toBeTruthy();
});

test("crear ticket por HTTP con la llave del cliente (stack completo)", async () => {
  const r = await app.inject({
    method: "POST", url: "/v1/tickets",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { canal: "email", identidad: "cliente@x.cl", asunto: "No llegó mi pedido", cuerpo: "Es urgente, voy a llamar a SERNAC" },
  });
  expect(r.statusCode).toBe(200);
  const t = r.json();
  expect(t.numero).toBe("1");
  // la detección de urgencia lo escaló solo a urgente
  expect(t.prioridad).toBe("urgente");
  // cabeceras de cuota presentes
  expect(r.headers["x-cuota-restante"]).toBeTruthy();
  expect(r.headers["x-content-type-options"]).toBe("nosniff");
});

test("listar bandeja por HTTP", async () => {
  const r = await app.inject({ method: "GET", url: "/v1/tickets", headers: { authorization: `Bearer ${token}` } });
  expect(r.statusCode).toBe(200);
  expect(Array.isArray(r.json().datos)).toBe(true);
  expect(r.json().datos.length).toBeGreaterThan(0);
});

test("contexto omnicanal por HTTP (la vista 360 única)", async () => {
  const lista = await app.inject({ method: "GET", url: "/v1/tickets", headers: { authorization: `Bearer ${token}` } });
  const id = lista.json().datos[0].id;
  const r = await app.inject({ method: "GET", url: `/v1/tickets/${id}/contexto`, headers: { authorization: `Bearer ${token}` } });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toHaveProperty("omnicanal");
  expect(r.json()).toHaveProperty("reincidencia");
});

test("un scope no autorizado por la llave → 403", async () => {
  // la llave no tiene tickets.asignar
  const lista = await app.inject({ method: "GET", url: "/v1/tickets", headers: { authorization: `Bearer ${token}` } });
  const id = lista.json().datos[0].id;
  const r = await app.inject({ method: "PUT", url: `/v1/tickets/${id}/asignar`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { usuarioId: "00000000-0000-0000-0000-000000000001" } });
  expect(r.statusCode).toBe(403);
  expect(r.json().error.codigo).toBe("SIN_PERMISO");
});

test("HSTS: se emite en staging/produccion, NUNCA en desarrollo (#111)", async () => {
  const prev = process.env.XHUB_ENV;
  process.env.XHUB_ENV = "staging";
  const conStg = await app.inject({ method: "GET", url: "/salud" });
  expect(conStg.headers["strict-transport-security"]).toContain("max-age=");
  expect(conStg.headers["strict-transport-security"]).toContain("includeSubDomains");
  process.env.XHUB_ENV = "desarrollo";
  const conDev = await app.inject({ method: "GET", url: "/salud" });
  expect(conDev.headers["strict-transport-security"]).toBeUndefined();
  process.env.XHUB_ENV = prev;
});
