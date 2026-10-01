import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Modo soporte (impersonation) del superadmin: entra al xHub de un cliente con MOTIVO,
 * por una ventana corta y auditada. Se lleva en una cookie FIRMADA (HMAC con el secreto
 * de Better Auth), sin estado en servidor. Payload: cliente, actor (quien entra), motivo,
 * expiración. La consola del cliente la honra solo si el actor es un admin de plataforma.
 */
const NOMBRE = "xhub_soporte";
const secreto = () => process.env.BETTER_AUTH_SECRET || "dev-inseguro";
export type Soporte = { c: string; a: string; m: string; e: number };

const b64u = (s: string) => Buffer.from(s).toString("base64url");
const firma = (body: string) => createHmac("sha256", secreto()).update(body).digest("base64url");

export function firmarSoporte(s: Soporte): string { const body = b64u(JSON.stringify(s)); return body + "." + firma(body); }
export function verificarSoporte(token?: string): Soporte | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const esperado = firma(body);
  const a = Buffer.from(mac), b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Soporte; return s.e > Date.now() ? s : null; } catch { return null; }
}
export function leerCookieSoporte(cookieHeader?: string): Soporte | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.split(/;\s*/).find((x) => x.startsWith(NOMBRE + "="));
  return m ? verificarSoporte(decodeURIComponent(m.slice(NOMBRE.length + 1))) : null;
}
function dominio(): string { return process.env.XHUB_COOKIE_DOMINIO ? `; Domain=${process.env.XHUB_COOKIE_DOMINIO}` : ""; }
export const cookieSoporte = (token: string, maxAgeSeg: number) =>
  `${NOMBRE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax${dominio()}; Max-Age=${maxAgeSeg}`;
export const cookieSoporteVacia = () => `${NOMBRE}=; Path=/; HttpOnly; Secure; SameSite=Lax${dominio()}; Max-Age=0`;
