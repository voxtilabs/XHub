/**
 * Cortacircuitos por instancia: si XContact falla sostenidamente, se ABRE, se deja
 * de golpear, y se reintenta tras un enfriamiento. Nosotros no reventamos su API.
 */
export type EstadoCorte = "cerrado" | "abierto" | "medio";

export interface OpcionesCorte { umbralFallos: number; enfriamientoMs: number; }

export class Cortacircuitos {
  private fallos = 0;
  private estado: EstadoCorte = "cerrado";
  private abiertoDesde = 0;
  constructor(private op: OpcionesCorte, private ahora: () => number = () => Date.now()) {}

  puedeLlamar(): boolean {
    if (this.estado === "cerrado") return true;
    if (this.estado === "abierto") {
      if (this.ahora() - this.abiertoDesde >= this.op.enfriamientoMs) { this.estado = "medio"; return true; }
      return false;
    }
    return true; // medio: se permite UNA prueba
  }
  registrarExito(): void { this.fallos = 0; this.estado = "cerrado"; }
  registrarFallo(): void {
    this.fallos++;
    if (this.estado === "medio" || this.fallos >= this.op.umbralFallos) {
      this.estado = "abierto"; this.abiertoDesde = this.ahora();
    }
  }
  get estadoActual(): EstadoCorte { return this.estado; }
}

/**
 * Balde de fichas: limita las llamadas SALIENTES por instancia. Rellena a `tasa`
 * fichas por segundo hasta `capacidad`.
 */
export class BaldeDeFichas {
  private fichas: number;
  private ultimo: number;
  constructor(private capacidad: number, private tasaPorSeg: number, private ahora: () => number = () => Date.now()) {
    this.fichas = capacidad; this.ultimo = ahora();
  }
  /** Intenta tomar una ficha. true si había. */
  tomar(): boolean {
    const t = this.ahora();
    this.fichas = Math.min(this.capacidad, this.fichas + ((t - this.ultimo) / 1000) * this.tasaPorSeg);
    this.ultimo = t;
    if (this.fichas >= 1) { this.fichas -= 1; return true; }
    return false;
  }
}

/** Clasifica un error de XContact para decidir si reintentar (taxonomía #51). */
export type CategoriaError = "transitorio" | "permiso" | "contrato" | "dato" | "caida";
export function clasificarError(status: number | undefined, cuerpo: string): CategoriaError {
  if (status === undefined || status === 0) return "caida";
  if (status === 429 || status >= 500) return "transitorio";
  if (status === 401 || status === 403) return "permiso";
  if (status === 422 && /there are no references|vCliente|SQL/i.test(cuerpo)) return "contrato";
  if (status === 400 || status === 422) return "dato";
  return "transitorio";
}
export function esReintentable(cat: CategoriaError): boolean {
  return cat === "transitorio" || cat === "caida";
}
