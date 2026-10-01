import { createHash, createHmac } from "node:crypto";

/**
 * Presignado de URLs S3 (AWS Signature v4, autenticación por query string), SIN
 * dependencias — habla S3 contra lo que haya (MinIO, R2, S3), path-style. Se usa para
 * dar al cliente una URL de subida (PUT) o descarga (GET) de un adjunto, de vida corta.
 * La POLÍTICA de prefijo por cliente vive en la capa de almacenamiento, no aquí.
 */
export interface OpcionesPresign {
  endpoint: string;   // p.ej. http://minio:9000  (host público para el navegador)
  region: string;     // MinIO: us-east-1
  accessKey: string;
  secretKey: string;
  bucket: string;
  key: string;        // ruta del objeto (incluye el prefijo del cliente)
  metodo: "GET" | "PUT" | "DELETE";
  expiraSeg?: number; // vida de la URL (def. 900s)
  ahora?: Date;       // inyectable para tests
}

// Codificación URI de AWS: todo byte salvo A-Za-z0-9 - _ . ~ se %-codifica (mayúsculas).
function enc(s: string, keepSlash = false): string {
  let out = "";
  for (const b of Buffer.from(s, "utf8")) {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === "/")) out += c;
    else out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();
const sha256hex = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");

/** Genera una URL S3 presignada (sigv4, query auth). Path-style: {endpoint}/{bucket}/{key}. */
export function presignS3(o: OpcionesPresign): string {
  const ahora = o.ahora ?? new Date();
  const amz = ahora.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDटHHMMSSZ
  const fecha = amz.slice(0, 8);
  const expira = Math.min(604800, Math.max(1, o.expiraSeg ?? 900));
  const host = new URL(o.endpoint).host;
  const scope = `${fecha}/${o.region}/s3/aws4_request`;
  const canonicalUri = "/" + enc(o.bucket, true) + "/" + enc(o.key, true);

  // Query canónica (params X-Amz-* ordenados y codificados).
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${o.accessKey}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expira),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [o.metodo, canonicalUri, canonicalQuery, canonicalHeaders, "host", "UNSIGNED-PAYLOAD"].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256hex(canonicalRequest)].join("\n");
  const kDate = hmac("AWS4" + o.secretKey, fecha);
  const kRegion = hmac(kDate, o.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const firma = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `${o.endpoint.replace(/\/$/, "")}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${firma}`;
}
