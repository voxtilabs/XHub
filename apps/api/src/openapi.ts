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
  const json = (schema: z.ZodTypeAny, example?: unknown) =>
    ({ "application/json": { schema, ...(example !== undefined ? { example } : {}) } });

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

  const ejTicket = { id: "9b1f…e9", numero: "4821", persona_id: "8bc6…c1", asunto: "No llegó mi pedido #A-1902", estado: "nuevo", prioridad: "alta", canal_origen: "email", asignado_a: null, resumen: null };
  r.registerPath({ method: "post", path: "/v1/tickets", summary: "Crear ticket", description: "Alcance requerido: `tickets.crear`. Crea la persona si no existe (por canal+identidad) y la deja en su línea de tiempo.", security: seg,
    request: { body: { content: json(E.crearTicket, { canal: "email", identidad: "juan@empresa.cl", asunto: "No llegó mi pedido #A-1902", prioridad: "alta", cuerpo: "Hice el pedido hace 5 días y aún no llega." }) } },
    responses: { 200: { description: "Ticket creado", content: json(ticketOut, ejTicket) }, 401: respError, 403: respError, 422: respError } });
  r.registerPath({ method: "get", path: "/v1/tickets", summary: "Bandeja de tickets", description: "Alcance requerido: `tickets.leer`. Paginación por cursor: repite con `cursor` = el `siguiente` de la respuesta hasta que sea `null`.", security: seg,
    request: { query: z.object({ estado: E.estadoEnum.optional(), cursor: z.string().optional() }) },
    responses: { 200: { description: "Lista", content: json(z.object({ datos: z.array(ticketOut), siguiente: z.string().nullable() }), { datos: [ejTicket], siguiente: null }) }, 401: respError, 403: respError } });
  r.registerPath({ method: "get", path: "/v1/tickets/{id}/contexto", summary: "Contexto omnicanal + reincidencia", description: "Alcance requerido: `tickets.leer`.", security: seg,
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "Contexto 360" }, 401: respError, 403: respError } });
  r.registerPath({ method: "get", path: "/v1/tickets/{id}/sugerencia", summary: "Respuesta sugerida por IA", description: "Alcance requerido: `tickets.responder`.", security: seg,
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: "Sugerencia (o null)", content: json(z.object({ sugerencia: z.string().nullable() })) } } });
  r.registerPath({ method: "put", path: "/v1/tickets/{id}/estado", summary: "Cambiar estado del ticket", description: "Alcance requerido: `tickets.responder`. Transiciones válidas (máquina de estados); una inválida devuelve 409.", security: seg,
    request: { params: z.object({ id: z.string() }), body: { content: json(E.cambiarEstado) } },
    responses: { 200: { description: "Ticket", content: json(ticketOut) }, 409: respError } });

  // Personas
  r.registerPath({ method: "get", path: "/v1/personas/{id}/ficha", summary: "Ficha 360 de una persona", description: "Alcance requerido: `nucleo.leer`.", security: seg,
    request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Ficha" }, 404: respError } });
  r.registerPath({ method: "get", path: "/v1/personas", summary: "Buscar personas", description: "Alcance requerido: `nucleo.leer`. Búsqueda en español (unaccent).", security: seg,
    request: { query: z.object({ q: z.string() }) }, responses: { 200: { description: "Resultados" } } });

  r.registerPath({ method: "put", path: "/v1/tickets/{id}/asignar", summary: "Asignar ticket a un usuario", description: "Alcance requerido: `tickets.asignar`.", security: seg,
    request: { params: z.object({ id: z.string() }), body: { content: json(E.asignar, { usuarioId: "b2c1e0a4-1111-2222-3333-444455556666" }) } },
    responses: { 200: { description: "ok", content: json(z.object({ ok: z.boolean() })) }, 403: respError, 404: respError } });

  // Derechos del titular (Ley 21.719)
  r.registerPath({ method: "get", path: "/v1/personas/{id}/exportar", summary: "Exportar datos de la persona (acceso / portabilidad)", description: "Alcance requerido: `nucleo.leer`. Devuelve TODO lo que xHub guarda de la persona (identidades, interacciones, tickets). Derecho de acceso y portabilidad — Ley 21.719.", security: seg,
    request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Export completo (JSON)" }, 401: respError, 403: respError, 404: respError } });
  r.registerPath({ method: "post", path: "/v1/personas/{id}/suprimir", summary: "Suprimir datos de la persona (derecho de supresión)", description: "Alcance requerido: `nucleo.administrar`. Redacta/borra los datos de la persona con **motivo obligatorio**. Derecho de supresión — Ley 21.719. Irreversible y auditado.", security: seg,
    request: { params: z.object({ id: z.string() }), body: { content: json(E.suprimirTitular, { motivo: "Solicitud del titular (correo del 12/09)" }) } },
    responses: { 200: { description: "Suprimida", content: json(z.object({ suprimida: z.boolean(), personaId: z.string(), ticketsRedactados: z.number() })) }, 401: respError, 403: respError, 404: respError } });

  const gen = new OpenApiGeneratorV31(r.definitions);
  return gen.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "xHub API", version: "1.0.0",
      description: [
        "API pública del cliente de xHub. Autenticación por **llave** (`Authorization: Bearer xhub_…`).",
        "Errores con **código estable** (`error.codigo`); cuota por cliente en cabeceras `x-cuota-*`; rate limit en `x-ratelimit-remaining`.",
        "",
        "## Alcances (scopes) por módulo",
        "La llave lleva alcances; cada operación pide el suyo:",
        "- `nucleo.leer` — ficha 360 y búsqueda de personas.",
        "- `tickets.leer` — bandeja y contexto de tickets.",
        "- `tickets.crear` — crear tickets.",
        "- `tickets.responder` — cambiar estado y respuesta sugerida.",
        "- `tickets.asignar` — asignar tickets.",
        "- `nucleo.administrar` — supresión de datos del titular (Ley 21.719).",
        "",
        "",
        "## La llave privada",
        "Cada cliente tiene su(s) **llave(s) de API** `xhub_…`. Las crea el **superadmin** desde el panel (Clientes → cliente → `+ Llave API`), donde se define su **conjunto de alcances** (nunca puede exceder los módulos encendidos del cliente). La llave se muestra **una sola vez**; en la base solo vive su `sha256`. El cliente se deduce **de la llave**, jamás de un header, así cruzar clientes es imposible.",
        "En esta página podés pulsar **Authorize** y pegar tu llave (`xhub_…`) para probar los endpoints en vivo.",
        "",
        "## Cuota y límites",
        "Respuesta trae `x-cuota-restante` / `x-cuota-limite` (cuota mensual del plan) y `x-ratelimit-remaining` (ráfaga por minuto). Al agotarse: `429` con `error.codigo` estable.",
        "",
        "## Derechos del titular (Ley 21.719)",
        "`GET /v1/personas/{id}/exportar` (acceso/portabilidad) y `POST /v1/personas/{id}/suprimir` (supresión, con motivo) cubren los derechos del titular. La supresión es irreversible y queda auditada.",
        "",
        "## Copy-paste — una ESCRITURA (crear ticket)",
        "```sh",
        "curl -X POST https://api-xhub.voxtilabs.cl/v1/tickets \\",
        "  -H 'Authorization: Bearer xhub_TU_LLAVE' -H 'content-type: application/json' \\",
        "  -d '{\"canal\":\"email\",\"identidad\":\"juan@empresa.cl\",\"asunto\":\"Mi pedido\",\"prioridad\":\"alta\"}'",
        "```",
        "## Copy-paste — una LECTURA (bandeja)",
        "```sh",
        "curl https://api-xhub.voxtilabs.cl/v1/tickets?estado=abierto \\",
        "  -H 'Authorization: Bearer xhub_TU_LLAVE'",
        "```",
      ].join("\n"),
    },
    servers: [{ url: "https://api-xhub.voxtilabs.cl", description: "Producción" }, { url: "https://api-stagexhub.voxtilabs.cl", description: "Staging" }],
  });
}
