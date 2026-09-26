/**
 * OpenAPI 3.1 generado desde los esquemas Zod (una sola fuente de verdad). Usamos
 * @asteasolutions/zod-to-openapi — el contrato del cliente sale de los mismos
 * esquemas que validan la entrada, así nunca se desincronizan.
 */
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import * as E from "./esquemas.js";

extendZodWithOpenApi(z);

export function generarOpenApi(): object {
  const r = new OpenAPIRegistry();
  const bearer = r.registerComponent("securitySchemes", "LlaveCliente", {
    type: "http", scheme: "bearer", description: "Llave de API del cliente (xhub_…) en Authorization: Bearer",
  });
  const seg = [{ [bearer.name]: [] }];
  const json = (schema: z.ZodTypeAny) => ({ "application/json": { schema } });

  const errorSchema = z.object({
    error: z.object({ codigo: z.string(), mensaje: z.string(), detalle: z.record(z.unknown()).optional(), request_id: z.string().optional() }),
  }).openapi("Error");
  const respError = { description: "Error", content: json(errorSchema) };

  // Salud
  r.registerPath({ method: "get", path: "/salud", summary: "¿El proceso vive?", responses: { 200: { description: "ok", content: json(z.object({ ok: z.boolean() })) } } });
  r.registerPath({ method: "get", path: "/listo", summary: "¿Postgres responde?", responses: { 200: { description: "listo" }, 503: { description: "no listo" } } });

  // Tickets
  const ticketOut = z.object({
    id: z.string(), numero: z.string(), persona_id: z.string(), asunto: z.string(),
    estado: E.estadoEnum, prioridad: E.prioridadEnum, canal_origen: z.string().nullable(),
    asignado_a: z.string().nullable(), resumen: z.string().nullable(),
  }).openapi("Ticket");

  r.registerPath({ method: "post", path: "/v1/tickets", summary: "Crear ticket", security: seg,
    request: { body: { content: json(E.crearTicket) } },
    responses: { 200: { description: "Ticket creado", content: json(ticketOut) }, 401: respError, 403: respError, 422: respError } });
  r.registerPath({ method: "get", path: "/v1/tickets", summary: "Bandeja de tickets", security: seg,
    request: { query: z.object({ estado: E.estadoEnum.optional(), cursor: z.string().optional() }) },
    responses: { 200: { description: "Lista", content: json(z.object({ datos: z.array(ticketOut), siguiente: z.string().nullable() })) }, 401: respError, 403: respError } });
  r.registerPath({ method: "get", path: "/v1/tickets/{id}/contexto", summary: "Contexto omnicanal + reincidencia", security: seg,
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "Contexto 360" }, 401: respError, 403: respError } });
  r.registerPath({ method: "get", path: "/v1/tickets/{id}/sugerencia", summary: "Respuesta sugerida por IA", security: seg,
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "Sugerencia (o null)", content: json(z.object({ sugerencia: z.string().nullable() })) } } });
  r.registerPath({ method: "put", path: "/v1/tickets/{id}/estado", summary: "Cambiar estado del ticket", security: seg,
    request: { params: z.object({ id: z.string() }), body: { content: json(E.cambiarEstado) } },
    responses: { 200: { description: "Ticket", content: json(ticketOut) }, 409: respError } });

  // Personas
  r.registerPath({ method: "get", path: "/v1/personas/{id}/ficha", summary: "Ficha 360 de una persona", security: seg,
    request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Ficha" }, 404: respError } });
  r.registerPath({ method: "get", path: "/v1/personas", summary: "Buscar personas", security: seg,
    request: { query: z.object({ q: z.string() }) }, responses: { 200: { description: "Resultados" } } });

  const gen = new OpenApiGeneratorV31(r.definitions);
  return gen.generateDocument({
    openapi: "3.1.0",
    info: { title: "xHub API", version: "1.0.0", description: "API pública del cliente de xHub. Autenticación por llave (Authorization: Bearer xhub_…). Errores con código estable; cuota por cliente en cabeceras x-cuota-*." },
    servers: [{ url: "https://api-xhub.voxtilabs.cl", description: "Producción" }, { url: "https://api-stagexhub.voxtilabs.cl", description: "Staging" }],
  });
}
