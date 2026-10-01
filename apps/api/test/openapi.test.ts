import { test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { crearApp } from "../src/app.js";
import { cerrarPool } from "@xhub/db";
import { cerrarRedis } from "@xhub/cuotas";

let app: FastifyInstance;
beforeAll(async () => { app = crearApp(); await app.ready(); });
afterAll(async () => { await app.close(); await cerrarPool(); await cerrarRedis(); });

test("/openapi.json es un OpenAPI 3.1 con las rutas del cliente", async () => {
  const r = await app.inject({ method: "GET", url: "/openapi.json" });
  expect(r.statusCode).toBe(200);
  const spec = r.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.info.title).toBe("xHub API");
  // las rutas principales están documentadas
  expect(spec.paths["/v1/tickets"]).toBeDefined();
  expect(spec.paths["/v1/tickets"].post).toBeDefined();
  expect(spec.paths["/v1/personas/{id}/ficha"]).toBeDefined();
  // el esquema de crear ticket tiene el enum de canal (viene de Zod)
  const body = spec.paths["/v1/tickets"].post.requestBody.content["application/json"].schema;
  const props = body.properties ?? spec.components.schemas[body.$ref?.split("/").pop() ?? ""]?.properties;
  expect(JSON.stringify(spec)).toContain("webchat");  // el enum de canal
});

test("declara el esquema de seguridad por llave", async () => {
  const spec = (await app.inject({ method: "GET", url: "/openapi.json" })).json();
  expect(spec.components.securitySchemes.LlaveCliente).toBeDefined();
  expect(spec.components.securitySchemes.LlaveCliente.scheme).toBe("bearer");
});

test("/docs sirve la página de documentación", async () => {
  const r = await app.inject({ method: "GET", url: "/docs" });
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-type"]).toContain("text/html");
  expect(r.body).toContain("openapi.json"); // data-url RELATIVO (intencional, ver app.ts)
});
