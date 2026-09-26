/**
 * Telemetría env-gated. Si no hay variables, no hace nada — cero dependencia en
 * desarrollo y en tests.
 *
 * SENTRY: pospuesto a propósito. Es un servicio que paga X5, así que no se cablea
 * todavía. La interfaz deja el hueco (`capturarError`): el día que X5 contrate
 * Sentry, se conecta aquí y en ninguna otra parte del código. Hasta entonces, los
 * errores se registran localmente (stderr estructurado), sin costo ni cuenta.
 */
export interface ConfigTelemetria {
  otelEndpoint?: string;
  entorno: string;
  servicio: string;
  // sentryDsn: pospuesto — lo paga X5 (ver arriba).
}

export function leerConfig(env = process.env): ConfigTelemetria {
  return {
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    entorno: env.XHUB_ENV || "desarrollo",
    servicio: env.XHUB_SERVICIO || "api",
  };
}

export interface Telemetria {
  activa: boolean;
  /** Registra un error. Hoy: stderr estructurado. Mañana: Sentry, si X5 lo contrata. */
  capturarError(e: unknown, contexto?: Record<string, unknown>): void;
  nuevoRequestId(): string;
}

let _seq = 0;

export async function iniciar(cfg = leerConfig()): Promise<Telemetria> {
  const activa = Boolean(cfg.otelEndpoint); // solo OTel activa hoy; Sentry pospuesto
  return {
    activa,
    capturarError(e, contexto) {
      // Sin Sentry: registro local estructurado, sin costo. El único punto donde
      // se conectaría Sentry el día que X5 lo pague.
      const err = e instanceof Error ? { nombre: e.name, mensaje: e.message, stack: e.stack } : { valor: String(e) };
      process.stderr.write(JSON.stringify({ nivel: "error", entorno: cfg.entorno, servicio: cfg.servicio, err, contexto }) + "\n");
    },
    nuevoRequestId() {
      return `req_${(_seq++).toString(36)}_${process.hrtime.bigint().toString(36)}`;
    },
  };
}
