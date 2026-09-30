import https from "node:https";

/**
 * Probador de conectividad de una instancia XContact. NO es el conector: es un test que
 * el superadmin corre contra un XContact (host + supervisor) para ver QUÉ cumple antes de
 * conectarlo — porque su API es inconsistente entre versiones/instancias (v4/v5/AMI, auth
 * por presencia, endpoints rotos). Devuelve un scorecard. TLS no valida → rejectUnauthorized:false.
 */
type Resp = { status: number; text: string; ms: number; error?: string };
function pedir(url: string, o: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number } = {}): Promise<Resp> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let u: URL;
    try { u = new URL(url); } catch { resolve({ status: 0, text: "", ms: 0, error: "URL inválida" }); return; }
    const body = o.body;
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: o.method || "GET",
      headers: { ...(o.headers || {}), ...(body ? { "content-length": String(Buffer.byteLength(body)) } : {}) },
      rejectUnauthorized: false, timeout: o.timeout || 8000,
    }, (res) => { let d = ""; res.on("data", (c) => { if (d.length < 4000) d += c; }); res.on("end", () => resolve({ status: res.statusCode || 0, text: d, ms: Date.now() - t0 })); });
    req.on("error", (e) => resolve({ status: 0, text: "", ms: Date.now() - t0, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, text: "", ms: Date.now() - t0, error: "timeout" }); });
    if (body) req.write(body);
    req.end();
  });
}

export type CheckXC = { nombre: string; detalle: string; ms: number; ok: boolean; nota?: string };
export async function probarXContact(inp: { host: string; usuario: string; password: string; apiKey?: string }): Promise<{ host: string; checks: CheckXC[]; resumen: Record<string, boolean> }> {
  const host = String(inp.host).replace(/^https?:\/\//, "").replace(/\/.*/, "").replace(/:\d+$/, "");
  const apiKey = (inp.apiKey || "").trim();
  const checks: CheckXC[] = [];

  // 1) Login supervisor (v5) — el que usa la consola: {username,password}
  const login = await pedir(`https://${host}:8011/api/v5/auth/supervisor`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: inp.usuario, password: inp.password }) });
  let token: string | null = null;
  try { const j = JSON.parse(login.text); token = j?.access_token ?? j?.supervisor?.token ?? j?.token ?? null; } catch { /* */ }
  checks.push({ nombre: "Login supervisor (v5 auth)", detalle: `POST :8011/api/v5/auth/supervisor → ${login.status || login.error}`, ms: login.ms, ok: !!token, nota: token ? "token obtenido" : "sin token" });

  // 2) REST v4/v2 (:8004) — con la api_key REST probamos AUTENTICACIÓN y lectura real
  const v4url = `https://${host}:8004/api/v2/campanhas`;
  const v4 = await pedir(v4url, apiKey ? { headers: { authorization: apiKey } } : {});
  const v4ok = apiKey ? v4.status === 200 : (v4.status === 401 || v4.status === 200);
  checks.push({ nombre: "REST v4/v2 (:8004)", detalle: `GET /api/v2/campanhas → ${v4.status || v4.error}`, ms: v4.ms, ok: v4ok,
    nota: apiKey
      ? (v4.status === 200 ? "api_key OK, lee datos" : v4.status === 401 ? "api_key rechazada (401)" : v4.status === 404 ? "ruta no está" : String(v4.status))
      : (v4.status === 401 ? "existe (falta api_key)" : v4.status === 404 ? "no está" : String(v4.status)) });

  // 3) REST v5 presente (:8011)
  const v5 = await pedir(`https://${host}:8011/api/v5/clientes`);
  checks.push({ nombre: "REST v5 (:8011)", detalle: `GET /api/v5/clientes → ${v5.status || v5.error}`, ms: v5.ms, ok: v5.status === 401 || v5.status === 200, nota: v5.status === 401 ? "existe (auth)" : v5.status === 404 ? "no está" : String(v5.status) });

  // 4) Bridge AMI (:3003)
  const ami = await pedir(`https://${host}:3003/`);
  checks.push({ nombre: "Bridge AMI (:3003)", detalle: `GET / → ${ami.status || ami.error}`, ms: ami.ms, ok: ami.status > 0, nota: ami.status > 0 ? "alcanzable" : "sin respuesta" });

  // 5) Lectura de datos AMI (requiere presencia socket.io — informativo)
  if (token) {
    const r = await pedir(`https://${host}:3003/ami/getFilasSupervisor`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ fila: null }) });
    let leyo = false, msg = "";
    try { const j = JSON.parse(r.text); leyo = Array.isArray(j.filas); msg = j.message || ""; } catch { /* */ }
    checks.push({ nombre: "Lectura AMI (filas)", detalle: `POST :3003/ami/getFilasSupervisor → ${r.status}`, ms: r.ms, ok: leyo, nota: leyo ? "leyó filas" : (msg || "requiere presencia socket.io") });
  }

  const resumen = {
    alcanzable: checks.some((c) => c.ok),
    login: !!token,
    restV4: checks.find((c) => c.nombre.startsWith("REST v4"))?.ok ?? false,
    apiKeyRest: apiKey ? ((checks.find((c) => c.nombre.startsWith("REST v4"))?.detalle ?? "").includes("→ 200")) : false,
    restV5: checks.find((c) => c.nombre.startsWith("REST v5"))?.ok ?? false,
    ami: checks.find((c) => c.nombre.startsWith("Bridge"))?.ok ?? false,
    lecturaDatos: checks.find((c) => c.nombre.startsWith("Lectura"))?.ok ?? false,
  };
  return { host, checks, resumen };
}
