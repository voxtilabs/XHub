import https from "node:https";

/**
 * fetch (mínimo) hacia XContact con TLS relajado, para el worker de sondeo. Su
 * certificado no valida (SAN/vencido — TRAMPAS.md T-05), así que aquí, en el borde de
 * salida y SOLO hacia XContact, se acepta. Se inyecta al conector como `fetchImpl`.
 * (Copia del helper de apps/api: es glue de borde, no lógica de negocio.)
 */
export const fetchXContact = ((url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(url); } catch { reject(new Error("URL inválida")); return; }
    const body = init?.body;
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: init?.method || "GET",
      headers: { ...(init?.headers || {}), ...(body ? { "content-length": String(Buffer.byteLength(body)) } : {}) },
      rejectUnauthorized: false, timeout: 15000,
    }, (res) => {
      let d = ""; res.on("data", (c) => { d += c; }); res.on("end", () => {
        const status = res.statusCode || 0;
        resolve({ ok: status >= 200 && status < 300, status, text: async () => d } as Response);
      });
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout hacia XContact")); });
    if (body) req.write(body);
    req.end();
  })) as unknown as typeof fetch;
