/**
 * Detección de urgencia/sentimiento desde el texto. Determinista y en es-CL, con la
 * MISMA interfaz que tendría un modelo de IA — el día que xHub tenga LLM, se cambia
 * la implementación y nada más. Marca tickets que necesitan atención humana rápido.
 */
export type Urgencia = "baja" | "media" | "alta";

const ENOJO = /\b(molest|indign|verg[uü]enz|inaceptable|p[eé]sim|horrible|estafa|denunci|abogad|sernac|nunca m[aá]s|reclam|furios|rabia|harto|cansad)\w*/i;
const LEGAL = /\b(sernac|demanda|abogad|legal|derecho del consumidor|ley 19\.?496)\w*/i;
const URGENTE = /\b(urgent|ya mismo|ahora|inmediat|no puedo esperar|de inmediato|emergenc)\w*/i;
const POSITIVO = /\b(gracias|excelente|felicit|amable|buen[ií]sim|agradezc|contento|maravill)\w*/i;

export interface AnalisisUrgencia { urgencia: Urgencia; enojo: boolean; riesgoLegal: boolean; positivo: boolean; señales: string[]; }

export function analizarUrgencia(texto: string): AnalisisUrgencia {
  const t = texto ?? "";
  const enojo = ENOJO.test(t);
  const riesgoLegal = LEGAL.test(t);
  const urgente = URGENTE.test(t);
  const positivo = POSITIVO.test(t) && !enojo;
  const señales: string[] = [];
  if (enojo) señales.push("cliente molesto");
  if (riesgoLegal) señales.push("menciona vía legal/SERNAC");
  if (urgente) señales.push("pide atención inmediata");
  if (positivo) señales.push("tono positivo");
  let urgencia: Urgencia = "baja";
  if (riesgoLegal || (enojo && urgente)) urgencia = "alta";
  else if (enojo || urgente) urgencia = "media";
  return { urgencia, enojo, riesgoLegal, positivo, señales };
}

/** Minutos hábiles efectivamente consumidos, restando el tiempo pausado (esperando cliente). */
export function slaConsumidoSeg(desdeCreado: number, pausaAcumSeg: number, pausaDesde: number | null, ahora: number): number {
  let pausa = pausaAcumSeg;
  if (pausaDesde) pausa += Math.max(0, Math.floor((ahora - pausaDesde) / 1000));
  return Math.max(0, Math.floor((ahora - desdeCreado) / 1000) - pausa);
}
