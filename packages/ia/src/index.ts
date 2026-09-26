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
}

export function leerConfigIA(env = process.env): ConfigIA {
  const clave = env.IA_API_KEY ?? "";
  return {
    activa: Boolean(clave),
    base: env.IA_API_BASE ?? "https://integrate.api.nvidia.com/v1",
    modelo: env.IA_MODELO ?? "z-ai/glm-5.3-flash",
    clave,
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
  try {
    const r = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.clave}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.modelo, messages: mensajes,
        max_tokens: opciones.maxTokens ?? 1024, temperature: opciones.temperatura ?? 0.2,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const d = await r.json() as { choices?: { message?: { content?: string | null } }[] };
    const c = d.choices?.[0]?.message?.content;
    return c && c.trim() ? c.trim() : null;
  } catch {
    return null; // cualquier fallo → el llamador usa su fallback
  } finally {
    clearTimeout(t);
  }
}

/** Resume una conversación en una frase. Devuelve null si la IA está apagada o falla. */
export async function resumirConversacionIA(mensajes: { autor: string; texto: string }[], cfg = leerConfigIA()): Promise<string | null> {
  if (!cfg.activa || mensajes.length === 0) return null;
  const conv = mensajes.map((m) => `${m.autor}: ${m.texto}`).join("\n");
  return completar([
    { role: "system", content: "Eres un asistente de un centro de contacto chileno. Resume la conversación del ticket en UNA frase breve y neutra, en español, sin preámbulos ni comillas." },
    { role: "user", content: conv },
  ], cfg, { maxTokens: 1200, topeMs: 55000 });
}
