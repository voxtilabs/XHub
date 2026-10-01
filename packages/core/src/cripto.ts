import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ErrorApi } from "./errores.js";

/**
 * Cifrado EN SOBRE para los secretos de la flota (credenciales de acceso a XContact
 * de cada cliente). El secreto se cifra con una clave de datos aleatoria (AES-256-GCM);
 * esa clave de datos se cifra a su vez con la CLAVE MAESTRA, que vive SOLO en el entorno
 * (XHUB_MASTER_KEY, 32 bytes en base64). En la base queda únicamente el sobre — jamás el
 * secreto ni la clave de datos en claro. Descifrar ocurre solo al momento de usar.
 *
 * Rotación: la clave maestra puede cambiar sin tocar los ciphertexts — basta re-envolver
 * la clave de datos. Cada sobre lleva la HUELLA de la maestra con la que se envolvió, así
 * se puede descifrar con la maestra actual o la anterior durante la transición.
 *
 * Interfaz pensada para migrar a un gestor de secretos externo sin reescribir: solo
 * cambiarían masterActual()/mastersDisponibles().
 */
const PREFIJO = "enc:v1:";

function bufMaestra(b64: string | undefined, ctx: string): Buffer {
  if (!b64) throw new ErrorApi("INTERNO", `Falta ${ctx} (clave maestra de cifrado)`);
  const b = Buffer.from(b64, "base64");
  if (b.length !== 32) throw new ErrorApi("INTERNO", `${ctx} debe ser 32 bytes en base64 (tiene ${b.length})`);
  return b;
}
function masterActual(): Buffer { return bufMaestra(process.env.XHUB_MASTER_KEY, "XHUB_MASTER_KEY"); }
/** Maestra actual + anterior (si existe): permite descifrar durante una rotación. */
function mastersDisponibles(): Buffer[] {
  const out = [masterActual()];
  if (process.env.XHUB_MASTER_KEY_ANTERIOR) out.push(bufMaestra(process.env.XHUB_MASTER_KEY_ANTERIOR, "XHUB_MASTER_KEY_ANTERIOR"));
  return out;
}
/** Huella corta de una clave, para saber cuál maestra envolvió cada sobre. */
function huella(k: Buffer): string { return createHash("sha256").update(k).digest("hex").slice(0, 8); }

interface Sobre { v: 1; mk: string; iv: string; ek: string; ekIv: string; ekTag: string; ct: string; tag: string }

function envolver(plaintext: string, master: Buffer): string {
  const dataKey = randomBytes(32);
  // 1) cifrar el secreto con la clave de datos
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", dataKey, iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  // 2) envolver la clave de datos con la maestra
  const ekIv = randomBytes(12);
  const ce = createCipheriv("aes-256-gcm", master, ekIv);
  const ek = Buffer.concat([ce.update(dataKey), ce.final()]);
  const ekTag = ce.getAuthTag();
  const s: Sobre = { v: 1, mk: huella(master), iv: iv.toString("base64"), ek: ek.toString("base64"),
    ekIv: ekIv.toString("base64"), ekTag: ekTag.toString("base64"), ct: ct.toString("base64"), tag: tag.toString("base64") };
  return PREFIJO + Buffer.from(JSON.stringify(s)).toString("base64");
}

function abrir(bundle: string, masters: Buffer[]): string {
  if (!esCifrado(bundle)) throw new ErrorApi("INTERNO", "El valor no es un sobre cifrado");
  const s = JSON.parse(Buffer.from(bundle.slice(PREFIJO.length), "base64").toString("utf8")) as Sobre;
  const master = masters.find((m) => huella(m) === s.mk);
  if (!master) throw new ErrorApi("INTERNO", "Ninguna clave maestra disponible coincide con el sobre (¿rotación incompleta?)");
  // 1) desenvolver la clave de datos
  const de = createDecipheriv("aes-256-gcm", master, Buffer.from(s.ekIv, "base64"));
  de.setAuthTag(Buffer.from(s.ekTag, "base64"));
  const dataKey = Buffer.concat([de.update(Buffer.from(s.ek, "base64")), de.final()]);
  // 2) descifrar el secreto
  const d = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(s.iv, "base64"));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(s.ct, "base64")), d.final()]).toString("utf8");
}

/** ¿Este valor es un sobre cifrado (vs un texto plano o un nombre de env var)? */
export function esCifrado(s: string | null | undefined): boolean { return typeof s === "string" && s.startsWith(PREFIJO); }

/** Cifra un secreto con la clave maestra actual del entorno. Devuelve el sobre. */
export function cifrarSecreto(plaintext: string): string { return envolver(plaintext, masterActual()); }

/** Descifra un sobre con la maestra actual o la anterior (transición de rotación). */
export function descifrarSecreto(bundle: string): string { return abrir(bundle, mastersDisponibles()); }

/** Re-envuelve un sobre con la maestra ACTUAL (rota). No toca el ciphertext del secreto. */
export function reenvolverConActual(bundle: string): string { return envolver(abrir(bundle, mastersDisponibles()), masterActual()); }

export type FuenteCredencial = "body" | "cifrada" | "env" | "ninguna";
/**
 * Resuelve la clave de una instancia, en orden: password del body (transitorio) →
 * sobre cifrado (bóveda) → nombre de env var (credencial_ref). Devuelve también la
 * FUENTE, para que el llamador audite los descifrados. Descifrar ocurre solo aquí,
 * al momento de usar.
 */
export function resolverCredencial(
  inst: { credencial_cifrada?: string | null; credencial_ref?: string | null },
  password?: string,
): { clave: string; fuente: FuenteCredencial } {
  if (password) return { clave: password, fuente: "body" };
  if (esCifrado(inst.credencial_cifrada)) return { clave: descifrarSecreto(inst.credencial_cifrada!), fuente: "cifrada" };
  if (inst.credencial_ref) return { clave: process.env[inst.credencial_ref] || "", fuente: "env" };
  return { clave: "", fuente: "ninguna" };
}

// Variantes con claves explícitas (para tests, sin depender del entorno):
export const _cifrarCon = (plaintext: string, master: Buffer) => envolver(plaintext, master);
export const _descifrarCon = (bundle: string, masters: Buffer[]) => abrir(bundle, masters);
export const _huella = huella;
