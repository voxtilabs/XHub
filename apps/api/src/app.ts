import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ErrorApi, aCuerpo } from "@xhub/core";
import { conCliente, conPlataforma, baseViva } from "@xhub/db";
import { rateLimit, consumirCuota } from "@xhub/cuotas";
import { autenticarApi, cuotaDe, type ContextoApi } from "@xhub/modulo-nucleo";
import { registrarRutasTickets } from "./rutas/tickets.js";
import { registrarRutasPersonas } from "./rutas/personas.js";
import { registrarRutasAdmin } from "./rutas/admin.js";
import { generarOpenApi } from "./openapi.js";

declare module "fastify" { interface FastifyRequest { ctx?: ContextoApi; requestId: string; } }

let _seq = 0;
const nuevoId = () => `req_${(_seq++).toString(36)}_${Date.now().toString(36)}`;

export function crearApp(): FastifyInstance {
  const app = Fastify({ logger: false, genReqId: nuevoId });

  // request-id en toda respuesta
  app.addHook("onRequest", async (req, reply) => { req.requestId = req.id as string; reply.header("x-request-id", req.requestId); });

  // Cabeceras de seguridad emitidas por la app (no solo el borde)
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.removeHeader("x-powered-by");
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

  // Contrato OpenAPI (público) + página de documentación
  const spec = generarOpenApi();
  app.get("/openapi.json", async () => spec);
  app.get("/docs", async (_req, reply) => {
    reply.type("text/html").send(
      `<!doctype html><html><head><meta charset="utf-8"><title>xHub API</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><script id="api-reference" data-url="/openapi.json"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`);
  });

  // Guard de la API pública del cliente: autentica por llave, rate limit + cuota.
  const guard = async (req: FastifyRequest, reply: import("fastify").FastifyReply) => {
    const auth = req.headers["authorization"];
    const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    // resolvemos la llave en plataforma (sin cliente fijado aún)
    const ctx = await conPlataforma((c) => autenticarApi(c, token));
    req.ctx = ctx;
    // rate limit por minuto (ráfaga)
    const rl = await rateLimit(ctx.llaveId, 120);
    reply.header("x-ratelimit-remaining", String(rl.restante));
    if (!rl.permitido) throw new ErrorApi("CUOTA_EXCEDIDA", "Demasiadas peticiones por minuto");
    // cuota mensual
    const limite = await conPlataforma((c) => cuotaDe(c, ctx.clienteId));
    const cuota = await consumirCuota(ctx.clienteId, limite);
    reply.header("x-cuota-restante", String(cuota.restante));
    if (!cuota.permitido) throw new ErrorApi("CUOTA_EXCEDIDA", "Cuota mensual de API agotada");
  };

  // Rutas /v1 protegidas por el guard, ejecutadas conCliente (RLS)
  app.register(async (v1) => {
    v1.addHook("onRequest", guard);
    registrarRutasTickets(v1);
    registrarRutasPersonas(v1);
  }, { prefix: "/v1" });

  registrarRutasAdmin(app);

  return app;
}

/** Helper: ejecuta el handler con el cliente del contexto fijado (RLS). */
export function conContexto<T>(req: FastifyRequest, fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  return conCliente(req.ctx!.clienteId, fn);
}
