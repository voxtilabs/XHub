import type { EstadoLlamada, SentidoLlamada, Llamada } from "./puerto.js";

/**
 * mapeo.ts — el único archivo que conoce el portugués de XContact.
 * Cada valor traducido tiene su test. Lo que no se traduce, no sale del conector.
 */

// Enum de estado de llamada revelado por la propia API v4 al rechazar un valor.
const ESTADO: Record<string, EstadoLlamada> = {
  "Atendida": "atendida",
  "Abandonada": "abandonada",
  "Transbordou": "transferida",
  "Não atendida": "no_atendida",
  "Ocupado": "ocupado",
  "Falha": "falla",
};

export function traducirEstadoLlamada(bruto: string): EstadoLlamada {
  const e = ESTADO[bruto?.trim()];
  if (!e) throw new Error(`Estado de llamada desconocido de XContact: "${bruto}"`);
  return e;
}

const SENTIDO: Record<string, SentidoLlamada> = { "entrante": "entrante", "saliente": "saliente", "inbound": "entrante", "outbound": "saliente", "1": "entrante", "2": "saliente" };
export function traducirSentido(bruto: string): SentidoLlamada {
  const s = SENTIDO[String(bruto).trim().toLowerCase()];
  return s ?? "entrante";
}

/**
 * Fecha de XContact → instante ISO absoluto. XContact entrega tiempos en su zona
 * (America/Santiago) sin offset ("2026-9-23 18:50:51"). Se interpreta en esa zona.
 */
export function traducirFecha(bruto: string, zona = "America/Santiago"): string {
  const m = String(bruto).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Fecha de XContact ilegible: "${bruto}"`);
  const [, Y, Mo, D, h, mi, s] = m;
  // offset de Chile: -03 (verano) o -04 (invierno). Se calcula con Intl para el día dado.
  const tentativa = new Date(Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +s));
  const off = offsetZona(tentativa, zona);
  return new Date(tentativa.getTime() - off * 60000).toISOString();
}

/**
 * El DÍA DEL NEGOCIO de un instante, como texto `AAAA-MM-DD` en la zona del negocio
 * (Chile). Una sola definición de «hoy»: una interacción de las 22:30 en Chile cae en
 * SU día, no en el de UTC del día siguiente (ley de la casa #3 / issue #50).
 */
export function diaDelNegocio(instante: string | Date, zona = "America/Santiago"): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  if (Number.isNaN(d.getTime())) throw new Error(`Instante ilegible: "${String(instante)}"`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function offsetZona(fecha: Date, zona: string): number {
  // minutos que hay que restar a UTC para obtener la hora local (Chile: 180 o 240)
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: zona, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(fecha).map((x) => [x.type, x.value]));
  const comoLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? "0" : p.hour), +p.minute, +p.second);
  return (comoLocal - fecha.getTime()) / 60000;
}

/** Teléfono chileno de XContact a E.164 (best-effort; null si no se puede). */
export function telefonoE164(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const d = String(bruto).replace(/[^\d]/g, "");
  let n = d;
  if (n.startsWith("56")) n = n.slice(2);
  if (n.length === 8) n = "9" + n;
  if (n.length === 9 && n.startsWith("9")) return "+56" + n;
  return null;
}

/** Envoltorio de listado de XContact: { dados, total, full }. */
export function desenvolver<T>(cuerpo: unknown): { datos: T[]; total: number } {
  const c = cuerpo as { dados?: T[]; total?: number };
  return { datos: Array.isArray(c?.dados) ? c.dados : [], total: Number(c?.total ?? 0) };
}

/** Primer campo presente de una lista de candidatos — tolerante al vocabulario de XContact. */
function primerCampo(o: Record<string, unknown>, claves: string[]): unknown {
  for (const k of claves) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
}

/**
 * Registro de llamada de XContact → `Llamada` (vocabulario nuestro).
 *
 * OJO — evidencia: la instancia demo devolvió `dados: []`, así que los NOMBRES
 * exactos de los campos salen del vocabulario del contrato, NO de datos reales.
 * Hay que confirmarlos contra una instancia con llamadas. Por eso, si falta lo
 * esencial (id, fecha o estado) se LANZA en vez de inventar un dato — el fallo es
 * ruidoso y este es el único lugar donde se toca cuando lleguen datos reales.
 */
export function mapearLlamada(bruto: Record<string, unknown>): Llamada {
  const id = primerCampo(bruto, ["id", "uniqueid", "call_id", "ligacao_id"]);
  const fecha = primerCampo(bruto, ["data", "data_hora", "datahora", "inicio", "data_ini"]);
  const estado = primerCampo(bruto, ["status", "situacao", "estado"]);
  if (id == null || fecha == null || estado == null)
    throw new Error("Registro de llamada de XContact sin id/fecha/estado reconocibles — confirmar el contrato contra datos reales");
  const dur = primerCampo(bruto, ["duracao", "billsec", "tempo_falado", "tempo", "duracion"]);
  return {
    id: String(id),
    personaTelefono: telefonoE164(primerCampo(bruto, ["numero", "telefone", "fone", "origem", "cliente"]) as string | null | undefined),
    sentido: traducirSentido(String(primerCampo(bruto, ["sentido", "tipo", "direcao"]) ?? "entrante")),
    estado: traducirEstadoLlamada(String(estado)),
    duracionSeg: Number(dur ?? 0) || 0,
    agente: (primerCampo(bruto, ["agente", "agente_fullname", "operador", "agent"]) as string | null) ?? null,
    cola: (primerCampo(bruto, ["fila", "nome_fila", "queue"]) as string | null) ?? null,
    ocurrioEn: traducirFecha(String(fecha)),
  };
}
