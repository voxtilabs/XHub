import { test, expect, beforeAll } from "vitest";
import { presignS3 } from "../src/s3presign.js";
import { nuevaClave, urlSubida, urlDescarga } from "../src/almacenamiento.js";

beforeAll(() => {
  process.env.S3_ENDPOINT = "http://minio:9000";
  process.env.S3_PUBLIC_ENDPOINT = "https://s3.example.com";
  process.env.S3_BUCKET = "xhub";
  process.env.S3_ACCESS_KEY = "minioadmin";
  process.env.S3_SECRET_KEY = "minioadmin-secreto";
  process.env.S3_REGION = "us-east-1";
});

const AHORA = new Date("2026-09-30T12:00:00.000Z");

test("presignS3 arma una URL sigv4 con todos los parámetros y firma", () => {
  const u = presignS3({ endpoint: "http://minio:9000", region: "us-east-1", accessKey: "ak", secretKey: "sk", bucket: "xhub", key: "clientes/c1/a.txt", metodo: "PUT", ahora: AHORA });
  expect(u).toContain("http://minio:9000/xhub/clientes/c1/a.txt?");
  for (const p of ["X-Amz-Algorithm=AWS4-HMAC-SHA256", "X-Amz-Credential=", "X-Amz-Date=20260930T120000Z", "X-Amz-Expires=", "X-Amz-SignedHeaders=host", "X-Amz-Signature="])
    expect(u).toContain(p);
  expect(u).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/); // hex sha256
});

test("determinista con la misma hora; distinto método → distinta firma", () => {
  const base = { endpoint: "http://minio:9000", region: "us-east-1", accessKey: "ak", secretKey: "sk", bucket: "xhub", key: "clientes/c1/a.txt", ahora: AHORA } as const;
  expect(presignS3({ ...base, metodo: "GET" })).toBe(presignS3({ ...base, metodo: "GET" }));
  expect(presignS3({ ...base, metodo: "GET" })).not.toBe(presignS3({ ...base, metodo: "PUT" }));
});

test("la llave SIEMPRE nace bajo el prefijo del cliente", () => {
  const k = nuevaClave("c1", "ticket", "t9", "Mi Archivo!!.pdf");
  expect(k.startsWith("clientes/c1/ticket/t9/")).toBe(true);
  expect(k).toMatch(/Mi_Archivo_\.pdf$/); // saneado (no-word chars colapsados)
});

test("firmar una llave de OTRO cliente es rechazado (subida y descarga)", () => {
  expect(() => urlSubida("c1", "clientes/c1/ticket/t1/x.pdf")).not.toThrow();
  expect(() => urlDescarga("c1", "clientes/c1/ticket/t1/x.pdf")).not.toThrow();
  // fuera de su prefijo → NO se firma nada
  expect(() => urlSubida("c1", "clientes/c2/ticket/t1/x.pdf")).toThrow(/no pertenece/);
  expect(() => urlDescarga("c1", "clientes/OTRO/secreto.pdf")).toThrow(/no pertenece/);
  expect(() => urlSubida("c1", "clientes/c1/../c2/x.pdf")).toThrow(); // traversal
});

test("la URL para el navegador usa el endpoint PÚBLICO, no el interno", () => {
  const u = urlSubida("c1", "clientes/c1/ticket/t1/x.pdf");
  expect(u.startsWith("https://s3.example.com/xhub/clientes/c1/")).toBe(true);
});
