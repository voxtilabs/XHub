import { AutenticadorXContact } from "./auth.js";
import { telefonoE164 } from "./mapeo.js";

/**
 * Lectura de CONTACTOS desde la API v5 de XContact (`:8011/api/v5/clientes`), la que
 * de verdad funciona hoy (ver docs/xcontact/AUTENTICACION.md). Traduce cada contacto
 * ajeno a un contacto NORMALIZADO de xHub: elige la mejor identidad (teléfono → email
 * → RUT → id externo) para colgar la persona de la espina dorsal. El conector es la
 * ÚNICA pieza que conoce el vocabulario en portugués (nome/numero/documento).
 */
export type CanalId = "telefono" | "email" | "rut" | "xcontact" | "messenger" | "webchat" | "instagram";
export interface ContactoNormalizado {
  externoId: string;
  nombre: string | null;
  canal: CanalId;               // canal de la identidad PRIMARIA (para colgar la persona)
  identidad: string;            // valor de la identidad primaria
  identidades: { canal: CanalId; valor: string }[]; // TODAS: xcontact (siempre) + tel/email/rut + adicionales
  etiquetas: string[];          // nombres de grupos de XContact
  campos: { nombre: string; valor: string }[]; // campos adicionales
}

export interface OpcionesLecturaV5 {
  host: string;               // p.ej. x5.xcontact.cl
  usuario: string;
  clave: string;
  fetchImpl?: typeof fetch;   // inyectable (la app le pasa uno con TLS relajado)
  limite?: number;            // tope de contactos por corrida
  desde?: string;             // cursor: solo contactos con id externo > este (sondeo incremental #59)
}

/** El id externo de XContact es numérico; comparamos como número para ordenar/cursar. */
const idNum = (s: string): number => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

const emailValido = (s: unknown): string | null => (typeof s === "string" && s.includes("@")) ? s.trim().toLowerCase() : null;
const lista = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v as Record<string, unknown>[] : [];
const primerTexto = (o: Record<string, unknown>, ...claves: string[]): string | null => {
  for (const k of claves) { const v = o[k]; if (typeof v === "string" && v.trim()) return v.trim(); }
  return null;
};

/**
 * Fila v5 de /clientes → contacto normalizado. Emparejamiento SOLO por identidad
 * (teléfono normalizado, email, RUT, id externo), nunca por nombre. La identidad
 * `xcontact` (id externo) va SIEMPRE, para reconciliar aunque cambie el teléfono.
 */
export function mapearContactoV5(row: Record<string, unknown>): ContactoNormalizado | null {
  const externoId = row.id != null ? String(row.id) : "";
  const nombre = primerTexto(row, "nome");
  const tel = telefonoE164(String(row.numero ?? ""));
  const email = emailValido(row.email);
  const documento = primerTexto(row, "documento");

  const identidades: { canal: CanalId; valor: string }[] = [];
  const push = (canal: CanalId, valor: string | null) => { if (valor && !identidades.some((i) => i.canal === canal && i.valor === valor)) identidades.push({ canal, valor }); };
  push("telefono", tel); push("email", email); push("rut", documento);
  if (externoId) push("xcontact", externoId); // la identidad externa SIEMPRE
  // Teléfonos y emails adicionales del contacto (reconciliación multi-canal).
  for (const n of lista(row.clienteNumerosAdicionais)) push("telefono", telefonoE164(String(n.numero ?? n.telefone ?? n.fone ?? "")));
  for (const e of lista(row.clienteEmailsAdicionais)) push("email", emailValido(e.email ?? e.endereco));
  // Facebook Messenger: otra identidad de canal para reconciliar con chats/webchat.
  const fb = primerTexto(row, "facebookID", "facebookId");
  if (fb) push("messenger", fb);

  // La identidad PRIMARIA (para colgar la persona): la primera no-xcontact, o xcontact.
  const primaria = identidades.find((i) => i.canal !== "xcontact") ?? identidades[0];
  if (!primaria) return null;

  const etiquetas = lista(row.clienteGrupos).map((g) => primerTexto(g, "nome", "nombre")).filter((x): x is string => !!x);
  if (row.isBusiness === true) etiquetas.push("Empresa"); // isBusiness → etiqueta
  const campos = lista(row.clienteCamposAdicionais)
    .map((k) => ({ nombre: primerTexto(k, "nome", "nombre", "campo", "label") ?? "", valor: primerTexto(k, "valor", "value", "conteudo") ?? "" }))
    .filter((k) => k.nombre && k.valor);

  return { externoId, nombre, canal: primaria.canal, identidad: primaria.valor, identidades, etiquetas, campos };
}

/** Autenticador v5 listo para una instancia (login single-flight + refresh). */
function autenticadorV5(o: OpcionesLecturaV5) {
  const f = o.fetchImpl ?? fetch;
  return { f, auth: new AutenticadorXContact({ authUrl: `https://${o.host}:8011/api/v5/auth/supervisor`, usuario: o.usuario, clave: o.clave, fetchImpl: f }) };
}

/** Lee y normaliza los contactos v5 de una instancia. Toda la HTTP ocurre aquí (fuera de transacción). */
export async function leerContactosV5(o: OpcionesLecturaV5): Promise<ContactoNormalizado[]> {
  const { f, auth } = autenticadorV5(o);
  const token = await auth.token();
  const r = await f(`https://${o.host}:8011/api/v5/clientes`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`XContact v5 /clientes → ${r.status}`);
  const j = JSON.parse(await r.text()) as { data?: unknown[] } | unknown[];
  const rows = (Array.isArray(j) ? j : j.data ?? []) as Record<string, unknown>[];
  const lim = o.limite ?? 500;
  const desde = o.desde ? idNum(o.desde) : -1;
  const out: ContactoNormalizado[] = [];
  for (const row of rows) {
    const m = mapearContactoV5(row);
    // Sondeo incremental: v5 devuelve todo el arreglo, así que el cursor lo aplicamos
    // aquí — solo procesamos ids nuevos (> cursor). Reanudable: reiniciar continúa.
    if (m && idNum(m.externoId) > desde) out.push(m);
  }
  out.sort((a, b) => idNum(a.externoId) - idNum(b.externoId)); // ascendente para cursar sin huecos
  return out.slice(0, lim);
}

export interface EtiquetaXContact { nombre: string; color: string | null; }

/** Fila v5 de /tags → etiqueta normalizada. null si no tiene nombre. */
export function mapearTagV5(row: Record<string, unknown>): EtiquetaXContact | null {
  const nombre = (typeof row.nome === "string" && row.nome.trim()) ? row.nome.trim()
    : (typeof row.nombre === "string" && row.nombre.trim()) ? row.nombre.trim() : null;
  if (!nombre) return null;
  return { nombre, color: (typeof row.cor === "string" && row.cor.trim()) ? row.cor.trim() : null };
}

/** Lee el CATÁLOGO de etiquetas (tags) de la instancia v5 (:8011/api/v5/tags). */
export async function leerTagsV5(o: OpcionesLecturaV5): Promise<EtiquetaXContact[]> {
  const { f, auth } = autenticadorV5(o);
  const token = await auth.token();
  const r = await f(`https://${o.host}:8011/api/v5/tags`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`XContact v5 /tags → ${r.status}`);
  const j = JSON.parse(await r.text()) as { data?: unknown[] } | unknown[];
  const rows = (Array.isArray(j) ? j : j.data ?? []) as Record<string, unknown>[];
  return rows.map(mapearTagV5).filter((x): x is EtiquetaXContact => !!x);
}
