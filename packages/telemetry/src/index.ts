/**
 * Telemetría env-gated. Si no hay variables, no hace nada — cero dependencia en
 * desarrollo y en tests. Sentry solo para errores; OTel para trazas. La carga de
 * las libs es diferida (import dinámico) para no pagarlas cuando están apagadas.
 */
export interface ConfigTelemetria {
  sentryDsn?: string;
  otelEndpoint?: string;
  entorno: string;
  servicio: string;
}

export function leerConfig(env = process.env): ConfigTelemetria {
  return {
    sentryDsn: env.SENTRY_DSN || undefined,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    entorno: env.XHUB_ENV || "desarrollo",
    servicio: env.XHUB_SERVICIO || "api",
  };
}

export interface Telemetria {
  activa: boolean;
  capturarError(e: unknown, contexto?: Record<string, unknown>): void;
  /** Un id de correlación por petición. Se propaga en el cuerpo de error. */
  nuevoRequestId(): string;
}

let _seq = 0;

/** Inicializa según config. Sin DSN ni endpoint, queda inerte pero usable. */
export async function iniciar(cfg = leerConfig()): Promise<Telemetria> {
  const activa = Boolean(cfg.sentryDsn || cfg.otelEndpoint);
  let sentry: { captureException: (e: unknown, o?: unknown) => void } | null = null;

  if (cfg.sentryDsn) {
    try {
      // import diferido: solo si hay DSN. En este esqueleto no está instalado,
      // así que degradamos a inerte sin romper (se instala en el servicio real).
      // @ts-expect-error paquete opcional
      const S = await import("@sentry/node").catch(() => null);
      if (S?.init) { S.init({ dsn: cfg.sentryDsn, environment: cfg.entorno }); sentry = S; }
    } catch { /* inerte */ }
  }

  return {
    activa,
    capturarError(e, contexto) {
      if (sentry) sentry.captureException(e, contexto ? { extra: contexto } : undefined);
    },
    nuevoRequestId() {
      // sin dependencias: contador + tiempo relativo. En el servicio real se usa
      // el trace id de OTel si está activo.
      return `req_${(_seq++).toString(36)}_${process.hrtime.bigint().toString(36)}`;
    },
  };
}
