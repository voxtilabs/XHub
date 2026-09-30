import { AutenticadorXContact } from "./auth.js";
import { telefonoE164 } from "./mapeo.js";

/**
 * Lectura de CONTACTOS desde la API v5 de XContact (`:8011/api/v5/clientes`), la que
 * de verdad funciona hoy (ver docs/xcontact/AUTENTICACION.md). Traduce cada contacto
 * ajeno a un contacto NORMALIZADO de xHub: elige la mejor identidad (teléfono → email
 * → RUT → id externo) para colgar la persona de la espina dorsal. El conector es la
 * ÚNICA pieza que conoce el vocabulario en portugués (nome/numero/documento).
 */
export interface ContactoNormalizado {
  externoId: string;
  nombre: string | null;
  canal: "telefono" | "email" | "rut" | "xcontact";
  identidad: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
}

export interface OpcionesLecturaV5 {
  host: string;               // p.ej. x5.xcontact.cl
  usuario: string;
  clave: string;
  fetchImpl?: typeof fetch;   // inyectable (la app le pasa uno con TLS relajado)
  limite?: number;            // tope de contactos por corrida
}

/** Fila v5 de /clientes → contacto normalizado. null si no hay identidad usable. */
export function mapearContactoV5(row: Record<string, unknown>): ContactoNormalizado | null {
  const externoId = row.id != null ? String(row.id) : "";
  const nombre = (typeof row.nome === "string" && row.nome.trim()) ? row.nome.trim() : null;
  const tel = telefonoE164(String(row.numero ?? ""));
  const email = (typeof row.email === "string" && row.email.includes("@")) ? row.email.trim().toLowerCase() : null;
  const documento = (typeof row.documento === "string" && row.documento.trim()) ? row.documento.trim() : null;
  let canal: ContactoNormalizado["canal"]; let identidad: string;
  if (tel) { canal = "telefono"; identidad = tel; }
  else if (email) { canal = "email"; identidad = email; }
  else if (documento) { canal = "rut"; identidad = documento; }
  else if (externoId) { canal = "xcontact"; identidad = externoId; }
  else return null;
  return { externoId, nombre, canal, identidad, telefono: tel, email, documento };
}

/** Lee y normaliza los contactos v5 de una instancia. Toda la HTTP ocurre aquí (fuera de transacción). */
export async function leerContactosV5(o: OpcionesLecturaV5): Promise<ContactoNormalizado[]> {
  const f = o.fetchImpl ?? fetch;
  const auth = new AutenticadorXContact({ authUrl: `https://${o.host}:8011/api/v5/auth/supervisor`, usuario: o.usuario, clave: o.clave, fetchImpl: f });
  const token = await auth.token();
  const r = await f(`https://${o.host}:8011/api/v5/clientes`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`XContact v5 /clientes → ${r.status}`);
  const j = JSON.parse(await r.text()) as { data?: unknown[] } | unknown[];
  const rows = (Array.isArray(j) ? j : j.data ?? []) as Record<string, unknown>[];
  const lim = o.limite ?? 500;
  const out: ContactoNormalizado[] = [];
  for (const row of rows.slice(0, lim)) {
    const m = mapearContactoV5(row);
    if (m) out.push(m);
  }
  return out;
}
