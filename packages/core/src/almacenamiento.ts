import { randomBytes } from "node:crypto";
import { ErrorApi } from "./errores.js";
import { presignS3 } from "./s3presign.js";

/**
 * Almacenamiento de adjuntos S3-compatible (ADR 0007: portable, habla S3 contra lo que
 * haya — MinIO/R2/S3). La regla dura: la LLAVE siempre bajo el prefijo del cliente
 * (`clientes/{clienteId}/…`). Fuera de su prefijo NO se firma nada — así un cliente no
 * puede firmar una URL hacia los archivos de otro.
 *
 * Config por entorno: S3_ENDPOINT (interno), S3_PUBLIC_ENDPOINT (el que ve el navegador;
 * cae a S3_ENDPOINT), S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION.
 */
export interface ConfigAlmacen { endpoint: string; publicEndpoint: string; region: string; bucket: string; accessKey: string; secretKey: string }

export function configAlmacen(): ConfigAlmacen {
  const endpoint = process.env.S3_ENDPOINT || "";
  if (!endpoint) throw new ErrorApi("INTERNO", "Almacenamiento no configurado (falta S3_ENDPOINT)");
  return {
    endpoint,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || endpoint,
    region: process.env.S3_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET || "xhub",
    accessKey: process.env.S3_ACCESS_KEY || "",
    secretKey: process.env.S3_SECRET_KEY || "",
  };
}
export function almacenConfigurado(): boolean { return !!process.env.S3_ENDPOINT; }

const prefijoCliente = (clienteId: string) => `clientes/${clienteId}/`;

/** Construye una llave nueva bajo el prefijo del cliente. El nombre se sanea. */
export function nuevaClave(clienteId: string, objetoTipo: string, objetoId: string, nombre: string): string {
  const seguro = nombre.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "archivo";
  const id = randomBytes(8).toString("hex");
  return `${prefijoCliente(clienteId)}${objetoTipo}/${objetoId}/${id}-${seguro}`;
}

/** Exige que la llave viva bajo el prefijo del cliente; si no, NO se firma. */
function exigirPrefijo(clienteId: string, key: string): void {
  if (!key.startsWith(prefijoCliente(clienteId)) || key.includes("..")) {
    throw new ErrorApi("SIN_PERMISO", "La llave no pertenece a este cliente");
  }
}

/** URL presignada de SUBIDA (PUT). Solo para llaves del propio cliente. */
export function urlSubida(clienteId: string, key: string, expiraSeg = 900): string {
  exigirPrefijo(clienteId, key);
  const c = configAlmacen();
  return presignS3({ endpoint: c.publicEndpoint, region: c.region, accessKey: c.accessKey, secretKey: c.secretKey, bucket: c.bucket, key, metodo: "PUT", expiraSeg });
}

/** URL presignada de DESCARGA (GET). Solo para llaves del propio cliente. */
export function urlDescarga(clienteId: string, key: string, expiraSeg = 900): string {
  exigirPrefijo(clienteId, key);
  const c = configAlmacen();
  return presignS3({ endpoint: c.publicEndpoint, region: c.region, accessKey: c.accessKey, secretKey: c.secretKey, bucket: c.bucket, key, metodo: "GET", expiraSeg });
}
