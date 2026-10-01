import type { FastifyInstance, FastifyRequest } from "fastify";
import { ErrorApi } from "@xhub/core";
import { conPlataforma } from "@xhub/db";

/**
 * Idempotencia de escrituras de la API pública. Si un POST trae `Idempotency-Key`,
 * el primer intento se ejecuta y su respuesta se guarda; los reintentos con la MISMA
 * clave devuelven esa respuesta guardada (con `Idempotent-Replay: true`) SIN repetir
 * el efecto. Así un cliente puede reintentar sin miedo tras un timeout de red.
 *
 * Acotada por `llave_id`: la clave de una llave nunca colisiona ni se lee desde otra.
 * Solo POST (los creadores); PUT/PATCH ya son idempotentes por contrato. Ventana 24 h.
 *
 * Limitación conocida: dos POST concurrentes con la misma clave y sin respuesta previa
 * pueden ejecutarse ambos (carrera); el segundo INSERT queda en no-op. Para el volumen
 * de esta API es aceptable; un endurecimiento futuro insertaría una fila "en curso".
 */
const CLAVE_MAX = 200;

interface ConIdem { _idemClave?: string; }
const marca = (req: FastifyRequest) => req as unknown as ConIdem;

export function registrarIdempotencia(v1: FastifyInstance): void {
  // Corta y responde con lo guardado si la clave ya se usó.
  v1.addHook("preHandler", async (req, reply) => {
    if (req.method !== "POST") return;
    const clave = req.headers["idempotency-key"];
    if (typeof clave !== "string" || !clave) return;
    if (clave.length > CLAVE_MAX) throw new ErrorApi("VALIDACION", `Idempotency-Key demasiado largo (máx ${CLAVE_MAX})`);
    const llaveId = req.ctx?.llaveId;
    if (!llaveId) return;
    const prev = await conPlataforma((c) => c.query(
      "select estado, respuesta from plataforma.idempotencia where llave_id=$1 and clave=$2", [llaveId, clave]));
    if (prev.rowCount) {
      reply.header("idempotent-replay", "true");
      reply.code(prev.rows[0].estado).type("application/json");
      return reply.send(prev.rows[0].respuesta);
    }
    marca(req)._idemClave = clave;
  });

  // Guarda la respuesta del primer intento exitoso (2xx) para futuros reintentos.
  v1.addHook("onSend", async (req, reply, payload) => {
    const clave = marca(req)._idemClave;
    if (!clave || req.method !== "POST") return payload;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    const llaveId = req.ctx?.llaveId;
    const cuerpo = typeof payload === "string" ? payload : null;
    if (llaveId && cuerpo != null) {
      await conPlataforma((c) => c.query(
        `insert into plataforma.idempotencia (llave_id, clave, metodo, ruta, estado, respuesta)
           values ($1,$2,$3,$4,$5,$6) on conflict (llave_id, clave) do nothing`,
        [llaveId, clave, req.method, req.url, reply.statusCode, cuerpo])).catch(() => {});
    }
    return payload;
  });
}
