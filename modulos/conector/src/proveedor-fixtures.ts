import type { ProveedorContactCenter, Llamada, PaginaProveedor } from "./puerto.js";
import { desenvolver, mapearLlamada } from "./mapeo.js";

/**
 * Implementación del puerto que REPRODUCE respuestas grabadas de XContact. Es lo que
 * permite desarrollar y correr el CI sin túnel ni instancia (ADR 0004): se le pasa el
 * mismo envoltorio { dados, total } que devolvería la API real. Pasa por el MISMO
 * traductor que el cliente HTTP, así que prueba el mapeo de verdad.
 */
export class ProveedorFixtures implements ProveedorContactCenter {
  constructor(private cfg: { version?: string; llamadas?: unknown; personasPorTelefono?: Record<string, { idExterno: string; nombre: string | null }> } = {}) {}

  version(): string { return this.cfg.version ?? "v4"; }

  async listarLlamadas(_desde: string, _hasta: string, _cursor?: number): Promise<PaginaProveedor<Llamada>> {
    const { datos, total } = desenvolver<Record<string, unknown>>(this.cfg.llamadas ?? { dados: [], total: 0 });
    return { datos: datos.map(mapearLlamada), total, hayMas: false };
  }

  async buscarPersonaPorTelefono(numero: string): Promise<{ idExterno: string; nombre: string | null } | null> {
    return this.cfg.personasPorTelefono?.[numero] ?? null;
  }
}
