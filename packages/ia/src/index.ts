/**
 * Adaptador de IA — env-gated. Sin llave configurada, `activa` es false y el
 * llamador usa su fallback determinista (nada se rompe, sin costo). Con llave,
 * llama a GLM (compatible OpenAI, NVIDIA NIM). El secreto va SIEMPRE por variable
 * de entorno, nunca en el repo. El proveedor y el modelo son configurables por env
 * (runtime multi-proveedor: cambiar de modelo no toca código).
 */
export interface ConfigIA {
  activa: boolean;
  base: string;    // endpoint OpenAI-compatible
  modelo: string;
  clave: string;
  tarea: string;   // etiqueta de la tarea (RESUMEN/DECISION/RESPUESTA/…) para medir consumo
}

/**
 * Observabilidad de IA: registro de UNA llamada. `completar` lo emite a un observador
 * global (lo cablea la capa API, que sí puede escribir en base y conocer el cliente).
 * @xhub/ia no importa base ni sabe de clientes: solo mide y avisa.
 */
export interface UsoIA {
  tarea: string; proveedor: string; modelo: string;
  tokensPrompt: number; tokensSalida: number; ms: number; ok: boolean;
}
type ObservadorIA = (u: UsoIA) => void;
let _observador: ObservadorIA | null = null;
/** Fija (o quita, con null) el observador de consumo de IA. */
export function fijarObservadorIA(fn: ObservadorIA | null): void { _observador = fn; }
function proveedorDe(base: string): string {
  if (base.includes("nvidia")) return "nvidia";
  if (base.includes("openrouter")) return "openrouter";
  if (base.includes("openai.com")) return "openai";
  try { return new URL(base).hostname; } catch { return "otro"; }
}

/**
 * Config de IA POR TAREA (proveedor por tarea). Cada tarea puede usar su propio
 * proveedor/modelo: p.ej. las DECISIONES (triage) con JEV en OpenRouter, y los
 * RESUMENES con GLM en NVIDIA. Se leen IA_<TAREA>_API_KEY/_BASE/_MODELO y, si no
 * están, se cae a las globales IA_API_KEY/_BASE/_MODELO. Cambiar de modelo o de
 * proveedor por tarea es cambiar el .env, sin tocar codigo.
 */
export function leerConfigIA(tarea?: string, env = process.env): ConfigIA {
  const p = tarea ? `IA_${tarea.toUpperCase()}_` : "IA_";
  const g = "IA_";
  // Una variable en "" (p.ej. `${VAR:-}` del compose) cuenta como AUSENTE: así la
  // config por tarea cae a la global sin romperse. `??` no bastaba (no cae en "").
  const val = (k: string): string | undefined => { const v = env[k]; return v && v.trim() ? v : undefined; };
  const clave = val(`${p}API_KEY`) ?? val(`${g}API_KEY`) ?? "";
  return {
    activa: Boolean(clave),
    base: val(`${p}API_BASE`) ?? val(`${g}API_BASE`) ?? "https://integrate.api.nvidia.com/v1",
    modelo: val(`${p}MODELO`) ?? val(`${g}MODELO`) ?? "z-ai/glm-5.3-flash",
    clave,
    tarea: (tarea ?? "general").toLowerCase(),
  };
}

export interface Mensaje { role: "system" | "user" | "assistant"; content: string; }

/**
 * Completa un chat. GLM 5.3 es un modelo de RAZONAMIENTO: su cadena de pensamiento
 * va en `reasoning_content` y la respuesta final en `content` — por eso pedimos
 * tokens generosos. Devuelve el `content` limpio, o null si no hay respuesta útil.
 * Tope de tiempo agresivo; el llamador cae a su fallback si esto devuelve null.
 */
export async function completar(
  mensajes: Mensaje[], cfg = leerConfigIA(), opciones: { maxTokens?: number; temperatura?: number; topeMs?: number } = {},
): Promise<string | null> {
  if (!cfg.activa) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opciones.topeMs ?? 30000);
  const inicio = Date.now();
  const emitir = (ok: boolean, tp = 0, ts = 0) => {
    if (!_observador) return;
    try { _observador({ tarea: cfg.tarea, proveedor: proveedorDe(cfg.base), modelo: cfg.modelo, tokensPrompt: tp, tokensSalida: ts, ms: Date.now() - inicio, ok }); }
    catch { /* la observabilidad nunca rompe la llamada */ }
  };
  try {
    const cuerpo = JSON.stringify({
      model: cfg.modelo, messages: mensajes,
      max_tokens: opciones.maxTokens ?? 1024, temperature: opciones.temperatura ?? 0.2,
    });
    const headers = { authorization: `Bearer ${cfg.clave}`, "content-type": "application/json" };
    // El modelo/proveedor puede estar temporalmente sobrecargado (429) o fallar (5xx):
    // reintentamos una vez con un respiro corto antes de caer al fallback determinista.
    let r: Response | null = null;
    for (let intento = 0; intento < 2; intento++) {
      r = await fetch(`${cfg.base}/chat/completions`, { method: "POST", headers, body: cuerpo, signal: ctrl.signal });
      if (r.ok || !(r.status === 429 || r.status >= 500) || intento === 1) break;
      await new Promise((res) => setTimeout(res, 1500));
    }
    if (!r || !r.ok) { emitir(false); return null; }
    const d = await r.json() as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    emitir(true, d.usage?.prompt_tokens ?? 0, d.usage?.completion_tokens ?? 0);
    const c = d.choices?.[0]?.message?.content;
    return c && c.trim() ? c.trim() : null;
  } catch {
    emitir(false);
    return null; // cualquier fallo → el llamador usa su fallback
  } finally {
    clearTimeout(t);
  }
}

/** Contexto de negocio del cliente, si lo hay, como línea extra del system prompt. */
const conContexto = (base: string, instrucciones?: string): string =>
  instrucciones?.trim() ? `${base}\n\nContexto del negocio del cliente (tenelo en cuenta):\n${instrucciones.trim()}` : base;

/** Resume una conversación en una frase. Devuelve null si la IA está apagada o falla. */
export async function resumirConversacionIA(mensajes: { autor: string; texto: string }[], cfg = leerConfigIA("RESUMEN"), instrucciones?: string): Promise<string | null> {
  if (!cfg.activa || mensajes.length === 0) return null;
  const conv = mensajes.map((m) => `${m.autor}: ${m.texto}`).join("\n");
  return completar([
    { role: "system", content: conContexto("Eres un asistente de un centro de contacto chileno. Resume la conversación del ticket en UNA frase breve y neutra, en español, sin preámbulos ni comillas.", instrucciones) },
    { role: "user", content: conv },
  ], cfg, { maxTokens: 1200, topeMs: 55000 });
}

/**
 * Sugiere una respuesta para el agente, a partir de la conversación y notas de
 * contexto. Usa la tarea "RESPUESTA" (proveedor por tarea). Devuelve null si la IA
 * está apagada o falla — el agente sigue escribiendo a mano.
 */
export async function sugerirRespuestaIA(
  mensajes: { autor: string; texto: string }[], contexto: string[] = [], cfg = leerConfigIA("RESPUESTA"), instrucciones?: string,
): Promise<string | null> {
  if (!cfg.activa || mensajes.length === 0) return null;
  const conv = mensajes.map((m) => `${m.autor}: ${m.texto}`).join("\n");
  const ctx = contexto.length ? `\n\nContexto del ticket:\n- ${contexto.join("\n- ")}` : "";
  return completar([
    { role: "system", content: conContexto("Eres un agente de soporte chileno, amable y resolutivo. Redacta UNA respuesta breve, cordial y en español para responder al cliente en este ticket. No inventes datos (números de pedido, fechas) que no estén en la conversación; si faltan, pídelos con amabilidad. Sin saludos genéricos largos, directo y humano.", instrucciones) },
    { role: "user", content: conv + ctx },
  ], cfg, { maxTokens: 1000, topeMs: 55000 });
}
