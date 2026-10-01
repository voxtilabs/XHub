/**
 * Autenticación y renovación del bearer de XContact (#48). El token vence (v5: 1 h);
 * si vence a mitad de una sincronización hay que renovarlo SIN perder trabajo y con
 * UNA sola renovación aunque muchas peticiones lo pidan a la vez (single-flight): la
 * renovación en vuelo se comparte, no se dispara una por petición.
 *
 * Receta real (verificada contra x5.xcontact.cl, ver docs/xcontact/AUTENTICACION.md):
 *   POST :8011/api/v5/auth/supervisor { username, password }
 *     → { access_token, expiresIn: "1h", refresh_token }
 *
 * La credencial llega POR REFERENCIA (el llamador resuelve las variables de entorno);
 * jamás el secreto en el código ni en la base.
 */
export interface OpcionesAuth {
  authUrl: string;              // p.ej. https://host:8011/api/v5/auth/supervisor
  usuario: string;
  clave: string;
  fetchImpl?: typeof fetch;
  ahora?: () => number;
  margenMs?: number;            // renovar este margen antes de expirar (def. 60 s)
  alRenovar?: () => void;       // hook de telemetría: cuenta las renovaciones
}

interface Sesion { token: string; expiraEn: number; refresh: string | null; }

/** "1h" | "30m" | "3600" (segundos) → milisegundos. */
export function msExpira(v: unknown): number {
  if (typeof v === "number") return v * 1000;
  const m = String(v ?? "").trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 3_600_000;
  const n = Number(m[1]);
  return n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] || "s").toLowerCase()] ?? 1000);
}

export class AutenticadorXContact {
  private sesion: Sesion | null = null;
  private enVuelo: Promise<Sesion> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly ahora: () => number;
  private readonly margen: number;

  constructor(private readonly o: OpcionesAuth) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.ahora = o.ahora ?? Date.now;
    this.margen = o.margenMs ?? 60_000;
  }

  /** Token válido; renueva si falta o está por vencer. Renovación coalescida. */
  async token(): Promise<string> {
    const s = this.sesion;
    if (s && this.ahora() < s.expiraEn - this.margen) return s.token;
    return (await this.renovar()).token;
  }

  /** Invalida la sesión (tras un 401) y renueva. Single-flight: comparte la en vuelo. */
  async invalidarYRenovar(): Promise<string> {
    this.sesion = null;
    return (await this.renovar()).token;
  }

  private renovar(): Promise<Sesion> {
    // Si ya hay una renovación en vuelo, TODOS esperan la misma (una sola llamada real).
    if (this.enVuelo) return this.enVuelo;
    this.enVuelo = this.login().finally(() => { this.enVuelo = null; });
    return this.enVuelo;
  }

  private async login(): Promise<Sesion> {
    this.o.alRenovar?.();
    const r = await this.fetchImpl(this.o.authUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: this.o.usuario, password: this.o.clave }),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Auth XContact ${r.status}`);
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(txt); } catch { /* respuesta no-JSON */ }
    const token = (j.access_token ?? j.token ?? (j.supervisor as { token?: string } | undefined)?.token) as string | undefined;
    if (!token) throw new Error("Auth XContact: sin token en la respuesta");
    this.sesion = { token, expiraEn: this.ahora() + msExpira(j.expiresIn ?? j.expires_in), refresh: (j.refresh_token as string) ?? null };
    return this.sesion;
  }

  /** Corre una petición con el bearer; ante 401 renueva (coalescido) y reintenta UNA vez. */
  async conBearer<T extends { status: number }>(hacer: (token: string) => Promise<T>): Promise<T> {
    let resp = await hacer(await this.token());
    if (resp.status === 401) resp = await hacer(await this.invalidarYRenovar());
    return resp;
  }
}
