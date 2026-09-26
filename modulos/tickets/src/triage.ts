import type { PoolClient } from "pg";
import { completar, leerConfigIA } from "@xhub/ia";
import type { Prioridad } from "./index.js";

export type ModoTriage = "automatico" | "sugerir" | "manual";
export interface ConfigTriage { modo: ModoTriage; umbral: number; }

export interface Evaluacion {
  necesitaTicket: boolean;
  confianza: number;            // 0..1
  categoria: string;
  prioridad: Prioridad;
  motivo: string;
  fuente: "ia" | "reglas";
}

export interface MensajeConv { autor: string; texto: string; }

// Palabras que indican un problema/solicitud que necesita seguimiento (fallback).
const PROBLEMA = /\b(reclam|problema|no funciona|no llega|no lleg[oó]|falla|error|roto|defectuos|devoluci|reembols|cobro|cancelar?|garant[ií]a|reponer|reenv[ií]|urgent|sin resolver|todav[ií]a no|a[uú]n no|pendiente|no puedo)\w*/i;
// Consultas que suelen resolverse en el momento (no necesitan ticket).
const INFO = /\b(horario|a qu[eé] hora|d[oó]nde queda|direcci[oó]n|precio|cu[aá]nto (cuesta|vale)|abren|cierran|tienen stock|informaci[oó]n)\w*/i;
const CIERRE = /\b(gracias|listo|perfecto|solucionado|resuelto|quedo? conforme|era eso|nada m[aá]s)\w*/i;

/** Clasificación determinista (fallback). Sin IA. */
export function clasificarPorReglas(mensajes: MensajeConv[]): Evaluacion {
  const texto = mensajes.map((m) => m.texto).join(" ");
  const problema = PROBLEMA.test(texto);
  const info = INFO.test(texto);
  const cierre = CIERRE.test(texto);
  let necesita = problema && !cierre;
  let conf = problema ? 0.75 : info ? 0.2 : 0.4;
  if (cierre && !problema) { necesita = false; conf = 0.15; }
  return {
    necesitaTicket: necesita,
    confianza: conf,
    categoria: problema ? "incidencia" : info ? "consulta" : "otro",
    prioridad: /urgent|no puedo|ya mismo/i.test(texto) ? "alta" : "media",
    motivo: problema ? "Menciona un problema o solicitud de seguimiento" : info ? "Parece una consulta de información" : "Sin señales claras",
    fuente: "reglas",
  };
}

/**
 * Clasifica una conversación: IA-first (GLM en JSON) con fallback determinista.
 * Decide si la conversación necesita un ticket de seguimiento.
 */
export async function clasificar(mensajes: MensajeConv[], cfgIA = leerConfigIA("DECISION")): Promise<Evaluacion> {
  if (!cfgIA.activa || mensajes.length === 0) return clasificarPorReglas(mensajes);
  const conv = mensajes.map((m) => `${m.autor}: ${m.texto}`).join("\n");
  const salida = await completar([
    { role: "system", content:
      "Eres un clasificador de un centro de contacto chileno. Decide si esta conversación necesita un TICKET de seguimiento (un problema o solicitud que requiere gestión posterior) o NO (consulta resuelta en el momento, saludo, agradecimiento). Responde SOLO un JSON válido, sin texto extra: {\"necesita_ticket\": true|false, \"confianza\": 0.0-1.0, \"categoria\": \"...\", \"prioridad\": \"baja|media|alta|urgente\", \"motivo\": \"frase corta\"}." },
    { role: "user", content: conv },
  ], cfgIA, { maxTokens: 1200, topeMs: 55000 });
  const j = extraerJson(salida);
  if (!j) return clasificarPorReglas(mensajes);
  const priRaw = String(j.prioridad ?? "media");
  const pri = ["baja", "media", "alta", "urgente"].includes(priRaw) ? priRaw : "media";
  return {
    necesitaTicket: Boolean(j.necesita_ticket),
    confianza: Math.max(0, Math.min(1, Number(j.confianza) || 0)),
    categoria: String(j.categoria ?? "otro"),
    prioridad: pri as Prioridad,
    motivo: String(j.motivo ?? ""),
    fuente: "ia",
  };
}

function extraerJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export type Accion = "creado" | "sugerido" | "descartado";
/** Decide la acción según la evaluación y la config del cliente (modo + umbral). */
export function decidir(ev: Evaluacion, cfg: ConfigTriage): Accion {
  if (!ev.necesitaTicket || ev.confianza < cfg.umbral) return "descartado";
  if (cfg.modo === "manual") return "descartado";
  if (cfg.modo === "sugerir") return "sugerido";
  return "creado"; // automatico
}

export async function configTriage(c: PoolClient, clienteId: string): Promise<ConfigTriage> {
  const r = await c.query("select modo, umbral from ticket_triage_config where cliente_id=$1", [clienteId]);
  if (r.rowCount === 0) return { modo: "sugerir", umbral: 0.7 }; // default sensato
  return { modo: r.rows[0].modo, umbral: Number(r.rows[0].umbral) };
}
export async function fijarConfigTriage(c: PoolClient, clienteId: string, cfg: ConfigTriage): Promise<void> {
  await c.query(
    `insert into ticket_triage_config (cliente_id, modo, umbral) values ($1,$2,$3)
       on conflict (cliente_id) do update set modo=excluded.modo, umbral=excluded.umbral, actualizado_en=now()`,
    [clienteId, cfg.modo, cfg.umbral]);
}
