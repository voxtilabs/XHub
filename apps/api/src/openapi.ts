/**
 * OpenAPI 3.1 generado desde los esquemas Zod (una sola fuente de verdad). Usamos
 * @asteasolutions/zod-to-openapi — el contrato del cliente sale de los mismos
 * esquemas que validan la entrada, así nunca se desincronizan.
 */
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { CATALOGO_SCOPES } from "@xhub/modulo-nucleo";
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
  r.registerPath({ method: "post", path: "/v1/personas", tags: ["Personas"], summary: "Registrar (o recuperar) una persona", description: "Alcance requerido: `nucleo.escribir`. Idempotente por identidad: la misma `canal`+`identidad` devuelve SIEMPRE la misma persona, nunca duplica.", security: seg,
    request: { body: { content: json(z.object({ canal: E.canalEnum, identidad: z.string(), nombre: z.string().optional() }), { canal: "email", identidad: "juan@empresa.cl", nombre: "Juan Pérez" }) } },
    responses: { 200: { description: "Persona", content: json(z.object({ id: z.string(), nombre: z.string().nullable() })) }, 401: respError, 403: respError, 422: respError } });
  r.registerPath({ method: "get", path: "/v1/personas/{id}/interacciones", tags: ["Personas"], summary: "Línea de tiempo unificada de la persona", description: "Alcance requerido: `nucleo.leer`. TODAS las interacciones de la persona (tickets, CRM, llamadas, notas…) en un solo hilo — la espina dorsal. Paginación por cursor (`limite` 1..100, def. 50).", security: seg,
    request: { params: z.object({ id: z.string() }), query: z.object({ cursor: z.string().optional(), limite: z.string().optional() }) },
    responses: { 200: { description: "Interacciones", content: json(z.object({ datos: z.array(z.object({ seq: z.string(), id: z.string(), tipo: z.string(), ocurrio_en: z.string(), modulo_origen: z.string(), resumen: z.string().nullable() })), siguiente: z.string().nullable() })) }, 401: respError, 403: respError, 404: respError } });

  r.registerPath({ method: "put", path: "/v1/tickets/{id}/asignar", summary: "Asignar ticket a un usuario", description: "Alcance requerido: `tickets.asignar`.", security: seg,
    request: { params: z.object({ id: z.string() }), body: { content: json(E.asignar, { usuarioId: "b2c1e0a4-1111-2222-3333-444455556666" }) } },
    responses: { 200: { description: "ok", content: json(z.object({ ok: z.boolean() })) }, 403: respError, 404: respError } });

  // Derechos del titular (Ley 21.719)
  r.registerPath({ method: "get", path: "/v1/personas/{id}/exportar", summary: "Exportar datos de la persona (acceso / portabilidad)", description: "Alcance requerido: `nucleo.leer`. Devuelve TODO lo que xHub guarda de la persona (identidades, interacciones, tickets). Derecho de acceso y portabilidad — Ley 21.719.", security: seg,
    request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Export completo (JSON)" }, 401: respError, 403: respError, 404: respError } });
  r.registerPath({ method: "post", path: "/v1/personas/{id}/suprimir", summary: "Suprimir datos de la persona (derecho de supresión)", description: "Alcance requerido: `nucleo.administrar`. Redacta/borra los datos de la persona con **motivo obligatorio**. Derecho de supresión — Ley 21.719. Irreversible y auditado.", security: seg,
    request: { params: z.object({ id: z.string() }), body: { content: json(E.suprimirTitular, { motivo: "Solicitud del titular (correo del 12/09)" }) } },
    responses: { 200: { description: "Suprimida", content: json(z.object({ suprimida: z.boolean(), personaId: z.string(), ticketsRedactados: z.number() })) }, 401: respError, 403: respError, 404: respError } });

  // ── xCRM (público) ──────────────────────────────────────────────────────────
  const oportunidadOut = z.object({
    id: z.string(), titulo: z.string(), valor: z.number(), moneda: z.string(),
    estado: z.enum(["abierta", "ganada", "perdida"]), persona_id: z.string(),
    etapa_id: z.string().nullable(), embudo_id: z.string().nullable(), etapa: z.string().nullable(),
    probabilidad: z.number().nullable(), cierre_esperado: z.string().nullable(),
    org_id: z.string().nullable(), organizacion: z.string().nullable(), creado_en: z.string(),
  }).openapi("Oportunidad");
  const ejOp = { id: "d3f1…a0", titulo: "Renovación plan anual — Acme", valor: 1200000, moneda: "CLP", estado: "abierta", persona_id: "8bc6…c1", etapa_id: "e1…", embudo_id: "p1…", etapa: "Contactado", probabilidad: 25, cierre_esperado: "2026-10-31", org_id: null, organizacion: null, creado_en: "2026-09-29T14:03:00Z" };
  const listaOp = z.object({ datos: z.array(oportunidadOut), siguiente: z.string().nullable() });
  const crmBody = (schema: z.ZodTypeAny, ejemplo?: unknown) => ({ body: { content: json(schema, ejemplo) } });

  r.registerPath({ method: "get", path: "/v1/crm/embudos", tags: ["CRM"], summary: "Embudos con sus etapas", description: "Alcance: `crm.leer`. Devuelve los pipelines del cliente, cada uno con sus etapas (nombre, orden, probabilidad).", security: seg,
    responses: { 200: { description: "Embudos" }, 401: respError, 403: respError } });
  r.registerPath({ method: "get", path: "/v1/crm/oportunidades", tags: ["CRM"], summary: "Listar oportunidades", description: "Alcance: `crm.leer`. Filtra por `embudo`, `etapa`, `estado`. Paginación por cursor: repite con `cursor` = el `siguiente` hasta que sea `null`. `limite` 1..100 (def. 50).", security: seg,
    request: { query: z.object({ embudo: z.string().optional(), etapa: z.string().optional(), estado: z.enum(["abierta", "ganada", "perdida"]).optional(), cursor: z.string().optional(), limite: z.string().optional() }) },
    responses: { 200: { description: "Lista", content: json(listaOp, { datos: [ejOp], siguiente: null }) }, 401: respError, 403: respError } });
  r.registerPath({ method: "post", path: "/v1/crm/oportunidades", tags: ["CRM"], summary: "Crear oportunidad", description: "Alcance: `crm.escribir`. Crea la persona si no existe (por `canal` + `identidad`) y deja la oportunidad en su línea de tiempo. Sin `embudoId`/`etapaId` usa el embudo por defecto y su primera etapa.", security: seg,
    request: crmBody(z.object({ canal: E.canalEnum, identidad: z.string(), titulo: z.string(), valor: z.number().int().optional(), moneda: z.string().optional(), embudoId: z.string().optional(), etapaId: z.string().optional(), cierreEsperado: z.string().optional(), probabilidad: z.number().optional(), orgId: z.string().optional() }), { canal: "email", identidad: "compras@acme.cl", titulo: "Renovación plan anual — Acme", valor: 1200000, moneda: "CLP", cierreEsperado: "2026-10-31" }),
    responses: { 200: { description: "Oportunidad", content: json(oportunidadOut, ejOp) }, 401: respError, 403: respError, 422: respError } });
  r.registerPath({ method: "get", path: "/v1/crm/oportunidades/{id}", tags: ["CRM"], summary: "Detalle de oportunidad + actividades", description: "Alcance: `crm.leer`.", security: seg,
    request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Oportunidad", content: json(oportunidadOut) }, 404: respError } });
  r.registerPath({ method: "patch", path: "/v1/crm/oportunidades/{id}", tags: ["CRM"], summary: "Actualizar oportunidad", description: "Alcance: `crm.escribir`. Campos parciales: `titulo`, `valor`, `moneda`, `etapaId`, `cierreEsperado`, `probabilidad`, `orgId`.", security: seg,
    request: { params: z.object({ id: z.string() }), ...crmBody(z.object({ titulo: z.string().optional(), valor: z.number().int().optional(), etapaId: z.string().optional(), probabilidad: z.number().optional() }), { etapaId: "e2…", probabilidad: 40 }) },
    responses: { 200: { description: "Oportunidad", content: json(oportunidadOut) }, 404: respError } });
  r.registerPath({ method: "post", path: "/v1/crm/oportunidades/{id}/cerrar", tags: ["CRM"], summary: "Cerrar oportunidad (ganada/perdida)", description: "Alcance: `crm.escribir`. `resultado` = `ganada` | `perdida`; en pérdida se puede dar `motivo`. Reabrir una cerrada devuelve 409.", security: seg,
    request: { params: z.object({ id: z.string() }), ...crmBody(z.object({ resultado: z.enum(["ganada", "perdida"]), motivo: z.string().optional() }), { resultado: "ganada" }) },
    responses: { 200: { description: "Oportunidad", content: json(oportunidadOut) }, 409: respError } });
  r.registerPath({ method: "post", path: "/v1/crm/oportunidades/{id}/actividades", tags: ["CRM"], summary: "Registrar actividad", description: "Alcance: `crm.escribir`. `tipo` = `nota` | `llamada` | `reunion` | `tarea` (def. `nota`). Queda en la línea de tiempo de la persona.", security: seg,
    request: { params: z.object({ id: z.string() }), ...crmBody(z.object({ tipo: z.enum(["nota", "llamada", "reunion", "tarea"]).optional(), cuerpo: z.string() }), { tipo: "llamada", cuerpo: "Llamé al contacto, quedamos en enviar propuesta." }) },
    responses: { 200: { description: "Actividad" }, 404: respError } });
  r.registerPath({ method: "get", path: "/v1/crm/organizaciones", tags: ["CRM"], summary: "Listar organizaciones", description: "Alcance: `crm.leer`. Paginación por cursor.", security: seg,
    request: { query: z.object({ cursor: z.string().optional(), limite: z.string().optional() }) }, responses: { 200: { description: "Lista" } } });
  r.registerPath({ method: "post", path: "/v1/crm/organizaciones", tags: ["CRM"], summary: "Crear organización", description: "Alcance: `crm.escribir`.", security: seg,
    request: crmBody(z.object({ nombre: z.string(), sitioWeb: z.string().optional(), rubro: z.string().optional(), telefono: z.string().optional(), direccion: z.string().optional() }), { nombre: "Acme SpA", rubro: "Retail", sitioWeb: "https://acme.cl" }),
    responses: { 200: { description: "Organización" }, 422: respError } });
  r.registerPath({ method: "get", path: "/v1/crm/prospectos", tags: ["CRM"], summary: "Listar prospectos (leads)", description: "Alcance: `crm.leer`. Filtra por `estado` (`activo`|`convertido`|`archivado`). Paginación por cursor.", security: seg,
    request: { query: z.object({ estado: z.enum(["activo", "convertido", "archivado"]).optional(), cursor: z.string().optional(), limite: z.string().optional() }) }, responses: { 200: { description: "Lista" } } });
  r.registerPath({ method: "post", path: "/v1/crm/prospectos", tags: ["CRM"], summary: "Crear prospecto", description: "Alcance: `crm.escribir`. Crea la persona si no existe y registra el prospecto en su historia.", security: seg,
    request: crmBody(z.object({ canal: E.canalEnum, identidad: z.string(), titulo: z.string(), valor: z.number().int().optional(), moneda: z.string().optional(), origen: z.string().optional() }), { canal: "webchat", identidad: "visita-8821", titulo: "Consulta por plan Pyme", origen: "sitio web" }),
    responses: { 200: { description: "Prospecto" }, 422: respError } });
  r.registerPath({ method: "post", path: "/v1/crm/prospectos/{id}/convertir", tags: ["CRM"], summary: "Convertir prospecto en oportunidad", description: "Alcance: `crm.escribir`. Crea la oportunidad sobre la misma persona y marca el prospecto como convertido. Si ya fue convertido/archivado: 409.", security: seg,
    request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Oportunidad", content: json(oportunidadOut) }, 409: respError } });
  r.registerPath({ method: "get", path: "/v1/crm/insights", tags: ["CRM"], summary: "Insights del embudo (forecast ponderado)", description: "Alcance: `crm.leer`. `forecast` = Σ(valor × probabilidad) de las abiertas; desglose por etapa; ganadas/perdidas; tasa de conversión.", security: seg,
    request: { query: z.object({ embudo: z.string().optional() }) }, responses: { 200: { description: "Insights" }, 401: respError, 403: respError } });

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
        "La llave lleva alcances; cada operación pide el suyo. Un scope de un módulo apagado no vale aunque la llave lo declare:",
        ...CATALOGO_SCOPES.map((s) => `- \`${s.scope}\` — ${s.descripcion}`),
        "",
        "",
        "## La llave privada",
        "Cada cliente tiene su(s) **llave(s) de API** `xhub_…`. Las crea el **superadmin** desde el panel (Clientes → cliente → `+ Llave API`), donde se define su **conjunto de alcances** (nunca puede exceder los módulos encendidos del cliente). La llave se muestra **una sola vez**; en la base solo vive su `sha256`. El cliente se deduce **de la llave**, jamás de un header, así cruzar clientes es imposible.",
        "En esta página podés pulsar **Authorize** y pegar tu llave (`xhub_…`) para probar los endpoints en vivo.",
        "",
        "## Idempotencia (reintentos seguros)",
        "En cualquier `POST` podés mandar la cabecera `Idempotency-Key: <valor único tuyo>`. El primer intento se ejecuta y su respuesta se guarda 24 h; si reintentás con la MISMA clave (p. ej. tras un timeout de red) recibís la MISMA respuesta y **no se duplica** el efecto — la réplica trae `Idempotent-Replay: true`. La clave se aísla por llave.",
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
    servers: [{ url: "https://stagexhub.voxtilabs.cl", description: "Staging (activo)" }, { url: "https://api-xhub.voxtilabs.cl", description: "Producción (dominio dedicado)" }],
  });
}
