import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { fromNodeHeaders } from "better-auth/node";
import { ErrorApi, aCuerpo } from "@xhub/core";
import { conCliente, conPlataforma, baseViva } from "@xhub/db";
import { rateLimit, consumirCuota } from "@xhub/cuotas";
import { autenticarApi, cuotaDe, type ContextoApi } from "@xhub/modulo-nucleo";
import { auth } from "./auth.js";
import { registrarRutasTickets } from "./rutas/tickets.js";
import { registrarRutasPersonas } from "./rutas/personas.js";
import { registrarRutasCrm } from "./rutas/publica-crm.js";
import { registrarRutasAdmin } from "./rutas/admin.js";
import { registrarRutasCliente } from "./rutas/cliente.js";
import { registrarConsolaTickets } from "./rutas/consola.js";
import { registrarCorreoEntrante } from "./rutas/correo-entrante.js";
import { registrarConsolaCrm } from "./rutas/crm.js";
import { generarOpenApi } from "./openapi.js";

const orígenesPanel = (process.env.XHUB_CORS_ORIGENES || "http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);

declare module "fastify" { interface FastifyRequest { ctx?: ContextoApi; requestId: string; } }

let _seq = 0;
const nuevoId = () => `req_${(_seq++).toString(36)}_${Date.now().toString(36)}`;

export function crearApp(): FastifyInstance {
  const app = Fastify({ logger: false, genReqId: nuevoId });

  // CORS con credenciales para el panel (cookies cross-subdominio). Orígenes cerrados.
  app.register(cors, { origin: orígenesPanel, credentials: true, maxAge: 86400 });

  // Login (Better Auth): monta /api/auth/* fuera del guard de la API pública.
  // Convierte la petición Fastify a Request web y devuelve la Response tal cual
  // (incluidas las cookies de sesión, que van como Set-Cookie múltiple).
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(req, reply) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pedido = new Request(url.toString(), {
        method: req.method,
        headers: fromNodeHeaders(req.headers),
        ...(req.body ? { body: JSON.stringify(req.body) } : {}),
      });
      const resp = await auth.handler(pedido);
      reply.status(resp.status);
      for (const [k, v] of resp.headers.entries()) {
        if (k.toLowerCase() !== "set-cookie") reply.header(k, v);
      }
      const cookies = resp.headers.getSetCookie?.() ?? [];
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(resp.body ? await resp.text() : null);
    },
  });

  // request-id en toda respuesta
  app.addHook("onRequest", async (req, reply) => { req.requestId = req.id as string; reply.header("x-request-id", req.requestId); });

  // Cabeceras de seguridad emitidas por la app (no solo el borde)
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.removeHeader("x-powered-by");
    // HSTS: la política de transporte estricto la emite la APP, no solo el borde.
    // Detrás del túnel el último salto no es TLS y x-forwarded-proto llega http, así
    // que se decide por el ENTORNO, nunca por esa cabecera (ley de la casa / #111).
    if (process.env.XHUB_ENV === "staging" || process.env.XHUB_ENV === "produccion") {
      reply.header("strict-transport-security", "max-age=63072000; includeSubDomains");
    }
    return payload;
  });

  // Filtro único de errores: código estable, voz propia, nunca filtra internals
  app.setErrorHandler((err, req, reply) => {
    const { http, cuerpo } = aCuerpo(err instanceof ErrorApi ? err : err, req.requestId);
    reply.code(http).send(cuerpo);
  });

  // Salud / listo
  app.get("/salud", async () => ({ ok: true }));
  app.get("/listo", async (_req, reply) => {
    if (await baseViva()) return { listo: true };
    reply.code(503); return { listo: false };
  });

  // Contrato OpenAPI (público) + página de documentación. Se montan en la raíz
  // (para el dominio propio del API) Y bajo /api/* — el único prefijo que el proxy
  // del staging enruta al API, así los docs son alcanzables sin dominio dedicado.
  // `data-url` RELATIVO ("openapi.json") → resuelve al lado de la página en ambos montajes.
  const spec = generarOpenApi();
  const paginaDocs =
    `<!doctype html><html><head><meta charset="utf-8"><title>xHub API</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><script id="api-reference" data-url="openapi.json"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
  for (const pfx of ["", "/api"]) {
    app.get(`${pfx}/openapi.json`, async () => spec);
    app.get(`${pfx}/docs`, async (_req, reply) => { reply.type("text/html").send(paginaDocs); });
  }

  // Guard de la API pública del cliente: autentica por llave, rate limit + cuota.
  const guard = async (req: FastifyRequest, reply: import("fastify").FastifyReply) => {
    const auth = req.headers["authorization"];
    const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    // resolvemos la llave en plataforma (sin cliente fijado aún)
    const ctx = await conPlataforma((c) => autenticarApi(c, token));
    req.ctx = ctx;
    // rate limit por minuto (ráfaga)
    const RAFAGA = 120;
    const rl = await rateLimit(ctx.llaveId, RAFAGA);
    reply.header("x-ratelimit-limit", String(RAFAGA));
    reply.header("x-ratelimit-remaining", String(rl.restante));
    if (!rl.permitido) { reply.header("retry-after", "60"); throw new ErrorApi("CUOTA_EXCEDIDA", "Demasiadas peticiones por minuto"); }
    // cuota mensual
    const limite = await conPlataforma((c) => cuotaDe(c, ctx.clienteId));
    const cuota = await consumirCuota(ctx.clienteId, limite);
    reply.header("x-cuota-limite", String(limite));
    reply.header("x-cuota-restante", String(cuota.restante));
    if (!cuota.permitido) throw new ErrorApi("CUOTA_EXCEDIDA", "Cuota mensual de API agotada");
  };

  // Rutas /v1 protegidas por el guard, ejecutadas conCliente (RLS)
  app.register(async (v1) => {
    v1.addHook("onRequest", guard);
    registrarRutasTickets(v1);
    registrarRutasPersonas(v1);
    registrarRutasCrm(v1);
  }, { prefix: "/v1" });

  registrarRutasAdmin(app);
  registrarRutasCliente(app);
  registrarConsolaTickets(app);
  registrarCorreoEntrante(app);
  registrarConsolaCrm(app);

  return app;
}

/** Helper: ejecuta el handler con el cliente del contexto fijado (RLS). */
export function conContexto<T>(req: FastifyRequest, fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  return conCliente(req.ctx!.clienteId, fn);
}
