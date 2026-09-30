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
/** Cuenta cuántos de un conjunto de reads v5 responden 200, con el detalle por recurso. */
function nota200(r: Resp): string { return r.status === 200 ? "200 OK" : r.status === 500 ? "500 (bug conocido)" : r.status === 404 ? "404 no está" : r.status === 401 ? "401 auth" : String(r.status || r.error); }

export async function probarXContact(inp: { host: string; usuario: string; password: string; apiKey?: string }): Promise<{ host: string; checks: CheckXC[]; resumen: Record<string, boolean | number> }> {
  const host = String(inp.host).replace(/^https?:\/\//, "").replace(/\/.*/, "").replace(/:\d+$/, "");
  const apiKey = (inp.apiKey || "").trim();
  const checks: CheckXC[] = [];

  // ── 1) Login supervisor (v5) ────────────────────────────────────────────────
  const login = await pedir(`https://${host}:8011/api/v5/auth/supervisor`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: inp.usuario, password: inp.password }) });
  let token: string | null = null; let refresh = false; let expira = "";
  try { const j = JSON.parse(login.text); token = j?.access_token ?? j?.supervisor?.token ?? j?.token ?? null; refresh = !!j?.refresh_token; expira = j?.expiresIn ?? j?.expires_in ?? ""; } catch { /* */ }
  checks.push({ nombre: "Login supervisor (v5)", detalle: `POST :8011/api/v5/auth/supervisor → ${login.status || login.error}`, ms: login.ms, ok: !!token, nota: token ? `token ok${expira ? ` (vence ${expira})` : ""}` : "sin token" });
  if (token) checks.push({ nombre: "Refresh token (v5)", detalle: refresh ? "presente" : "ausente", ms: 0, ok: refresh, nota: refresh ? "renovación sin re-login" : "habrá que re-loguear al vencer" });

  const bearer = token ? { authorization: `Bearer ${token}` } : undefined;

  // ── 2) Lecturas v5 (:8011) — colas, IVR, contactos, config ──────────────────
  let leeColas = false, leeContactosV5 = false, v5ok = 0;
  if (bearer) {
    const recursos: [string, string][] = [
      ["Colas (filas)", "filas"], ["IVR (ura)", "ura"], ["Contactos (clientes)", "clientes"],
      ["Pausas", "pausas"], ["Anexos (ramais)", "ramais"], ["Troncales (troncos)", "troncos"],
      ["Horarios", "horarios"], ["Etiquetas (tags)", "tags"], ["Agentes", "agentes"],
    ];
    const resultados = await Promise.all(recursos.map(([, p]) => pedir(`https://${host}:8011/api/v5/${p}`, { headers: bearer })));
    resultados.forEach((r, i) => {
      const ok = r.status === 200;
      if (ok) v5ok++;
      if (recursos[i][1] === "filas") leeColas = ok;
      if (recursos[i][1] === "clientes") leeContactosV5 = ok;
      checks.push({ nombre: `v5 · ${recursos[i][0]}`, detalle: `GET /api/v5/${recursos[i][1]} → ${r.status || r.error}`, ms: r.ms, ok, nota: nota200(r) });
    });
  }

  // ── 3) REST v4/v2/v3 (:8004) — el dominio grande: contactos, campañas, agentes ──
  const swag = await pedir(`https://${host}:8004/swagger.json`);
  let rutasV4 = 0; try { rutasV4 = Object.keys(JSON.parse(swag.text).paths || {}).length; } catch { /* */ }
  checks.push({ nombre: "Swagger REST (:8004)", detalle: `GET /swagger.json → ${swag.status || swag.error}`, ms: swag.ms, ok: swag.status === 200, nota: swag.status === 200 ? `${rutasV4 || "?"} rutas v2–v4` : "no expone swagger" });

  let leeCampanas = false, leeContactosV4 = false;
  const v4hdr = apiKey ? { headers: { authorization: apiKey } } : {};
  const [camp, cont] = await Promise.all([
    pedir(`https://${host}:8004/api/v2/campanhas`, v4hdr),
    pedir(`https://${host}:8004/api/v2/clientes`, v4hdr),
  ]);
  leeCampanas = camp.status === 200; leeContactosV4 = cont.status === 200;
  const notaKey = (r: Resp) => apiKey ? (r.status === 200 ? "api_key OK, lee datos" : r.status === 401 ? "api_key rechazada" : nota200(r)) : (r.status === 401 ? "existe (falta api_key)" : nota200(r));
  checks.push({ nombre: "REST v4 · Campañas", detalle: `GET /api/v2/campanhas → ${camp.status || camp.error}`, ms: camp.ms, ok: apiKey ? leeCampanas : (camp.status === 401 || camp.status === 200), nota: notaKey(camp) });
  checks.push({ nombre: "REST v4 · Contactos", detalle: `GET /api/v2/clientes → ${cont.status || cont.error}`, ms: cont.ms, ok: apiKey ? leeContactosV4 : (cont.status === 401 || cont.status === 200), nota: notaKey(cont) });

  // ── 4) Bridge AMI (:3003) — tiempo real ─────────────────────────────────────
  const ami = await pedir(`https://${host}:3003/`);
  checks.push({ nombre: "Bridge AMI (:3003)", detalle: `GET / → ${ami.status || ami.error}`, ms: ami.ms, ok: ami.status > 0, nota: ami.status > 0 ? "alcanzable" : "sin respuesta" });
  if (token) {
    const r = await pedir(`https://${host}:3003/ami/getFilasSupervisor`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ fila: null }) });
    let leyo = false, msg = ""; try { const j = JSON.parse(r.text); leyo = Array.isArray(j.filas); msg = j.message || ""; } catch { /* */ }
    checks.push({ nombre: "AMI · Lectura en vivo", detalle: `POST :3003/ami/getFilasSupervisor → ${r.status}`, ms: r.ms, ok: leyo, nota: leyo ? "leyó filas" : (msg || "requiere presencia socket.io") });
  }

  // ── Scorecard de capacidades: ¿qué podríamos sincronizar hoy? ────────────────
  const resumen: Record<string, boolean | number> = {
    alcanzable: checks.some((c) => c.ok),
    login: !!token,
    refresh,
    lecturasV5: v5ok,
    puedeLeerColas: leeColas,
    puedeLeerContactos: leeContactosV5 || leeContactosV4,
    puedeLeerCampanas: leeCampanas,
    apiKeyRest: apiKey ? (leeCampanas || leeContactosV4) : false,
    swaggerV4: swag.status === 200,
    ami: ami.status > 0,
    checksOk: checks.filter((c) => c.ok).length,
    checksTotal: checks.length,
  };
  return { host, checks, resumen };
}
