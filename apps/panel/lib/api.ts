"use client";
// Cliente del API de xHub para el panel. Deriva el API por subdominio en runtime y
// envía la cookie de sesión (Better Auth) → el guard de superadmin autoriza.
function apiBase(): string {
  if (typeof window === "undefined") return "";
  const o = window.location.origin;
  if (o.includes("://stagexhub")) return o.replace("://stagexhub", "://api-stagexhub");
  if (o.includes("://xhub")) return o.replace("://xhub", "://api-xhub");
  return o.replace(/:\d+$/, ":3001");
}

export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(apiBase() + path, {
    ...opts,
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({} as Record<string, unknown>));
  if (!r.ok) {
    const d = data as { error?: { mensaje?: string }; mensaje?: string };
    throw new Error(d?.error?.mensaje ?? d?.mensaje ?? `HTTP ${r.status}`);
  }
  return data as T;
}
export const apiDocsUrl = () => apiBase() + "/docs";
