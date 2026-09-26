import type { ProveedorContactCenter, Llamada, PaginaProveedor } from "./puerto.js";
import { desenvolver, mapearLlamada } from "./mapeo.js";
import { Cortacircuitos, BaldeDeFichas, clasificarError, esReintentable, type CategoriaError } from "./resiliencia.js";

/**
 * cliente.ts — la ÚNICA pieza que habla HTTP con XContact. Todo lo verificado contra
 * la instancia real (AUTENTICACION.md / CONTRATO.md) vive aquí:
 *   - login: POST /api/v4/login/supervisor { nome, senha } → token (UUID, bearer)
 *   - resto: Authorization: Bearer <token>
 *   - listados: envoltorio { error, total, dados }
 * Envuelve cada llamada en el cortacircuitos + balde de fichas + reintentos, para
 * no reventar su API y degradar en vez de caer. La credencial llega por referencia
 * (env), NUNCA en el repo.
 */
export interface ConfigXContact {
  baseUrl: string;              // https://host:8004  (sin /api)
  usuario: string;
  clave: string;                // por env/referencia
  version?: string;             // "v4" por defecto
  timeoutMs?: number;
  maxReintentos?: number;
  fetchImpl?: typeof fetch;     // inyectable para tests
  ahora?: () => number;
  dormir?: (ms: number) => Promise<void>;
}

export class ErrorProveedor extends Error {
  constructor(message: string, readonly categoria: CategoriaError, readonly status?: number) {
    super(message);
    this.name = "ErrorProveedor";
  }
}

export class ClienteXContact implements ProveedorContactCenter {
  private token: string | null = null;
  private readonly ver: string;
  private readonly f: typeof fetch;
  private readonly corte: Cortacircuitos;
  private readonly balde: BaldeDeFichas;
  private readonly timeoutMs: number;
  private readonly maxReintentos: number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(private cfg: ConfigXContact) {
    this.ver = cfg.version ?? "v4";
    this.f = cfg.fetchImpl ?? fetch;
    const ahora = cfg.ahora ?? (() => Date.now());
    this.dormir = cfg.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = cfg.timeoutMs ?? 8000;
    this.maxReintentos = cfg.maxReintentos ?? 3;
    this.corte = new Cortacircuitos({ umbralFallos: 5, enfriamientoMs: 30_000 }, ahora);
    this.balde = new BaldeDeFichas(20, 10, ahora);
  }

  version(): string { return this.ver; }
  get estadoCorte(): string { return this.corte.estadoActual; }

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/$/, "")}/api/${this.ver}/${path.replace(/^\//, "")}`;
  }

  /** POST login/supervisor → token bearer, cacheado. */
  async autenticar(): Promise<void> {
    const cuerpo = await this.hacer("login/supervisor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: this.cfg.usuario, senha: this.cfg.clave }),
    }, false) as { token?: string } | null;
    const tok = cuerpo?.token;
    if (!tok) throw new ErrorProveedor("Login de XContact sin token", "permiso", 200);
    this.token = tok;
  }

  private pedir(path: string): Promise<unknown> {
    return this.hacer(path, { method: "GET" }, true);
  }

  /**
   * Ejecuta una petición con reintentos (backoff exponencial solo en errores
   * reintentables), cortacircuitos y balde de fichas. Ante 401 re-autentica UNA vez.
   */
  private async hacer(path: string, init: RequestInit, conAuth: boolean, yaReintentoAuth = false): Promise<unknown> {
    if (!this.corte.puedeLlamar()) throw new ErrorProveedor("Cortacircuitos abierto para XContact", "caida");
    if (conAuth && !this.token) await this.autenticar();

    let ultimo: ErrorProveedor = new ErrorProveedor("XContact no respondió", "caida");
    for (let intento = 0; intento <= this.maxReintentos; intento++) {
      if (!this.balde.tomar()) await this.dormir(100);
      const ac = new AbortController();
      const reloj = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) };
        if (conAuth && this.token) headers["authorization"] = `Bearer ${this.token}`;
        const resp = await this.f(this.url(path), { ...init, headers, signal: ac.signal });
        const txt = await resp.text();
        if (resp.ok) { this.corte.registrarExito(); return txt ? JSON.parse(txt) : null; }
        if (resp.status === 401 && conAuth && !yaReintentoAuth) {
          this.token = null;
          await this.autenticar();
          return await this.hacer(path, init, conAuth, true);
        }
        const cat = clasificarError(resp.status, txt);
        ultimo = new ErrorProveedor(`XContact ${resp.status}: ${txt.slice(0, 200)}`, cat, resp.status);
        if (!esReintentable(cat)) { this.corte.registrarFallo(); throw ultimo; }
      } catch (e) {
        if (e instanceof ErrorProveedor) { if (!esReintentable(e.categoria)) throw e; ultimo = e; }
        else ultimo = new ErrorProveedor(`Fallo de red a XContact: ${(e as Error).message}`, "caida");
      } finally {
        clearTimeout(reloj);
      }
      if (intento < this.maxReintentos) await this.dormir(Math.min(2_000, 150 * 2 ** intento));
    }
    this.corte.registrarFallo();
    throw ultimo;
  }

  async listarLlamadas(desde: string, hasta: string, _cursor?: number): Promise<PaginaProveedor<Llamada>> {
    const cuerpo = await this.pedir(`filas/ligacoes?data_ini=${encodeURIComponent(desde)}&data_fim=${encodeURIComponent(hasta)}`);
    const { datos, total } = desenvolver<Record<string, unknown>>(cuerpo);
    return { datos: datos.map(mapearLlamada), total, hayMas: false };
  }

  async buscarPersonaPorTelefono(numero: string): Promise<{ idExterno: string; nombre: string | null } | null> {
    const cuerpo = await this.pedir(`contato/findCliente/${encodeURIComponent(numero)}`) as Record<string, unknown> | null;
    if (!cuerpo || Object.keys(cuerpo).length === 0) return null;
    const id = cuerpo.id ?? cuerpo.contato_id ?? cuerpo.cliente_id;
    if (id == null) return null;
    return { idExterno: String(id), nombre: (cuerpo.nome ?? cuerpo.nome_cliente ?? cuerpo.fullname ?? null) as string | null };
  }
}
