import { test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { crearApp } from "../src/app.js";
import { cerrarPool, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente, fijarEntitlement, crearLlave, crearAdminToken } from "@xhub/modulo-nucleo";
import { cerrarRedis } from "@xhub/cuotas";
import { join } from "node:path";

let app: FastifyInstance, token = "", adminTok = "";
const H = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  const A = (await conPlataforma((c) => crearCliente(c, "Val SA"))).id;
  await conPlataforma((c) => fijarEntitlement(c, A, "tickets", true));
  token = (await conPlataforma((c) => crearLlave(c, A, "k", ["tickets.crear"]))).token;
  adminTok = (await conPlataforma((c) => crearAdminToken(c, "admin"))).token;
  app = crearApp(); await app.ready();
});
afterAll(async () => { await app.close(); await cerrarPool(); await cerrarRedis(); });

test("Zod rechaza un canal inválido con 400 y detalle del campo", async () => {
  const r = await app.inject({ method: "POST", url: "/v1/tickets", headers: H(token),
    payload: { canal: "fax", identidad: "x@x.cl", asunto: "Hola" } });
  expect(r.statusCode).toBe(422);
  expect(r.json().error.codigo).toBe("VALIDACION");
  expect(r.json().error.detalle.errores[0].campo).toBe("canal");
});

test("Zod rechaza campos faltantes indicando cuáles", async () => {
  const r = await app.inject({ method: "POST", url: "/v1/tickets", headers: H(token), payload: { canal: "email" } });
  expect(r.statusCode).toBe(422);
  const campos = r.json().error.detalle.errores.map((e: { campo: string }) => e.campo);
  expect(campos).toContain("identidad");
  expect(campos).toContain("asunto");
});

test("Zod rechaza campos extra (additionalProperties)", async () => {
  const r = await app.inject({ method: "POST", url: "/v1/tickets", headers: H(token),
    payload: { canal: "email", identidad: "x@x.cl", asunto: "Ok", inyeccion: "malicia" } });
  expect(r.statusCode).toBe(422);
});

test("un asunto vacío se rechaza; uno válido pasa", async () => {
  const malo = await app.inject({ method: "POST", url: "/v1/tickets", headers: H(token), payload: { canal: "email", identidad: "x@x.cl", asunto: "" } });
  expect(malo.statusCode).toBe(422);
  const bueno = await app.inject({ method: "POST", url: "/v1/tickets", headers: H(token), payload: { canal: "email", identidad: "x@x.cl", asunto: "Válido" } });
  expect(bueno.statusCode).toBe(200);
});

test("admin: nombre de cliente muy corto se rechaza", async () => {
  const r = await app.inject({ method: "POST", url: "/admin/clientes", headers: H(adminTok), payload: { nombre: "x" } });
  expect(r.statusCode).toBe(422);
  expect(r.json().error.detalle.errores[0].campo).toBe("nombre");
});
