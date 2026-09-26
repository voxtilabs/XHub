import { test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { crearApp } from "../src/app.js";
import { cerrarPool, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearAdminToken } from "@xhub/modulo-nucleo";
import { cerrarRedis } from "@xhub/cuotas";
import { join } from "node:path";

let app: FastifyInstance, adminTok = "";
const H = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  adminTok = (await conPlataforma((c) => crearAdminToken(c, "Operaciones X5"))).token;
  app = crearApp(); await app.ready();
});
afterAll(async () => { await app.close(); await cerrarPool(); await cerrarRedis(); });

test("sin token de admin → 401", async () => {
  const r = await app.inject({ method: "GET", url: "/admin/clientes" });
  expect(r.statusCode).toBe(401);
  expect(r.json().error.codigo).toBe("NO_AUTENTICADO");
});

test("un token de CLIENTE no sirve para el admin", async () => {
  const r = await app.inject({ method: "GET", url: "/admin/clientes", headers: H("xhub_no_es_admin") });
  expect(r.statusCode).toBe(401);
});

test("FLUJO COMPLETO: el superadmin crea un cliente, le enciende módulos, le da una llave y esa llave funciona", async () => {
  // 1. crear cliente
  const cli = await app.inject({ method: "POST", url: "/admin/clientes", headers: H(adminTok), payload: { nombre: "Retail Andes SpA" } });
  expect(cli.statusCode).toBe(200);
  const clienteId = cli.json().id;
  expect(cli.json().estado).toBe("en_alta");

  // 2. activar y encender módulos
  await app.inject({ method: "PUT", url: `/admin/clientes/${clienteId}/estado`, headers: H(adminTok), payload: { estado: "activo" } });
  await app.inject({ method: "PUT", url: `/admin/clientes/${clienteId}/modulos/tickets`, headers: H(adminTok), payload: { encendido: true } });
  await app.inject({ method: "PUT", url: `/admin/clientes/${clienteId}/modulos/nucleo`, headers: H(adminTok), payload: { encendido: true } });

  // 3. fijar cuota mensual
  const q = await app.inject({ method: "PUT", url: `/admin/clientes/${clienteId}/cuota`, headers: H(adminTok), payload: { limiteMensual: 10000 } });
  expect(q.statusCode).toBe(200);

  // 4. crear una llave de API para el cliente
  const llave = await app.inject({ method: "POST", url: `/admin/clientes/${clienteId}/llaves`, headers: H(adminTok), payload: { nombre: "Integración ERP", scopes: ["tickets.crear", "tickets.leer"] } });
  expect(llave.statusCode).toBe(200);
  const token = llave.json().token;
  expect(token).toMatch(/^xhub_/);  // llave de cliente

  // 5. esa llave YA funciona en la API del cliente
  const t = await app.inject({ method: "POST", url: "/v1/tickets", headers: H(token), payload: { canal: "email", identidad: "cli@x.cl", asunto: "Primer ticket" } });
  expect(t.statusCode).toBe(200);
  expect(t.json().numero).toBe("1");
  // y la cuota que ve la llave es la que fijó el admin (10000, no el default)
  expect(Number(t.headers["x-cuota-restante"])).toBeLessThan(10000);
  expect(Number(t.headers["x-cuota-restante"])).toBeGreaterThan(9000);
});

test("el cliente aparece en la lista del admin con sus módulos", async () => {
  const r = await app.inject({ method: "GET", url: "/admin/clientes", headers: H(adminTok) });
  const retail = r.json().datos.find((c: { nombre: string; estado: string }) => c.nombre === "Retail Andes SpA" && c.estado === "activo");
  expect(retail).toBeDefined();
  expect(retail.estado).toBe("activo");
  expect(retail.modulos).toContain("tickets");
});

test("apagar un módulo se refleja: la llave pierde ese scope en la petición siguiente", async () => {
  const cli = await app.inject({ method: "POST", url: "/admin/clientes", headers: H(adminTok), payload: { nombre: "Prueba Apagar" } });
  const id = cli.json().id;
  await app.inject({ method: "PUT", url: `/admin/clientes/${id}/estado`, headers: H(adminTok), payload: { estado: "activo" } });
  await app.inject({ method: "PUT", url: `/admin/clientes/${id}/modulos/tickets`, headers: H(adminTok), payload: { encendido: true } });
  const llave = await app.inject({ method: "POST", url: `/admin/clientes/${id}/llaves`, headers: H(adminTok), payload: { nombre: "k", scopes: ["tickets.leer"] } });
  const tok = llave.json().token;
  // con el módulo encendido, la lista funciona
  const ok = await app.inject({ method: "GET", url: "/v1/tickets", headers: H(tok) });
  expect(ok.statusCode).toBe(200);
  // apagar tickets
  await app.inject({ method: "PUT", url: `/admin/clientes/${id}/modulos/tickets`, headers: H(adminTok), payload: { encendido: false } });
  const no = await app.inject({ method: "GET", url: "/v1/tickets", headers: H(tok) });
  expect(no.statusCode).toBe(403);  // el scope tickets.leer ya no vale
});
