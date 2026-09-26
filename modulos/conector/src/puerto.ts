/**
 * Puerto ProveedorContactCenter. Vocabulario NUESTRO — nada de "ligacao"/"fila"
 * cruza esta frontera. Una implementación real habla con XContact; la de fixtures
 * corre sin túnel (ADR 0004).
 */
export type EstadoLlamada = "atendida" | "abandonada" | "transferida" | "no_atendida" | "ocupado" | "falla";
export type SentidoLlamada = "entrante" | "saliente";

export interface Llamada {
  id: string;
  personaTelefono: string | null;   // E.164 si se puede
  sentido: SentidoLlamada;
  estado: EstadoLlamada;
  duracionSeg: number;
  agente: string | null;
  cola: string | null;
  ocurrioEn: string;                // ISO
}

export interface PaginaProveedor<T> { datos: T[]; total: number; hayMas: boolean; }

export interface ProveedorContactCenter {
  version(): string;
  listarLlamadas(desde: string, hasta: string, cursor?: number): Promise<PaginaProveedor<Llamada>>;
  buscarPersonaPorTelefono(numero: string): Promise<{ idExterno: string; nombre: string | null } | null>;
}
