import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";

function conexion(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL no está definida");
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379) };
}

/** Nombre de cola por módulo: "<modulo>:<cola>" — un módulo apagado no crea las suyas. */
export function nombreCola(modulo: string, cola: string): string {
  return `${modulo}.${cola}`;
}

const OPCIONES_DEFECTO = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: false, // los fallidos quedan para inspección (cola de muertos)
};

/** Crea una cola de un módulo. */
export function crearCola(modulo: string, cola: string): Queue {
  return new Queue(nombreCola(modulo, cola), { connection: conexion(), defaultJobOptions: OPCIONES_DEFECTO });
}

/**
 * Crea un worker para una cola de un módulo. Reintentos con retroceso ya vienen
 * de las opciones de la cola; un fallo definitivo queda en estado 'failed' con su
 * causa legible (cola de muertos consultable).
 */
export function crearWorkerDeModulo<T = unknown, R = unknown>(
  modulo: string, cola: string, procesar: Processor<T, R>, concurrencia = 5,
): Worker<T, R> {
  return new Worker<T, R>(nombreCola(modulo, cola), procesar, {
    connection: conexion(), concurrency: concurrencia,
  });
}
