import type { PoolClient } from "pg";
import type { ProveedorContactCenter, Llamada } from "./puerto.js";

/**
 * ingesta.ts — trae las llamadas de XContact a la LÍNEA DE TIEMPO del núcleo.
 *
 * El conector NO importa el núcleo: recibe estas dos operaciones inyectadas (igual
 * que xTickets recibe su NucleoApi). Así la frontera de módulos se respeta y esto
 * corre en un test sin arrastrar Postgres.
 */
export interface NucleoIngesta {
  asegurarPersona(c: PoolClient, canal: string, valor: string, nombre?: string | null): Promise<{ id: string }>;
  registrarInteraccion(c: PoolClient, e: {
    personaId: string; tipo: string; moduloOrigen: string;
    ocurrioEn?: string; objetoTipo?: string; objetoId?: string;
    resumen?: string; dedupeId?: string; meta?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface ResumenSync { leidas: number; ingestadas: number; sinTelefono: number; }

function resumenLlamada(ll: Llamada): string {
  const dir = ll.sentido === "entrante" ? "Entrante" : "Saliente";
  const min = Math.floor(ll.duracionSeg / 60), seg = ll.duracionSeg % 60;
  return `${dir} · ${ll.estado} · ${min}m ${seg}s${ll.agente ? ` · ${ll.agente}` : ""}`;
}

/**
 * Sincroniza un rango de llamadas hacia el núcleo. IDEMPOTENTE: el `dedupeId`
 * (`xc:llamada:<id>`) hace que reprocesar el mismo rango no duplique la interacción
 * (la unicidad la garantiza `nucleo.interacciones(cliente_id, dedupe_id)`).
 *
 * Una llamada sin teléfono reconocible no se cuelga de nadie —no hay a quién— así
 * que se cuenta aparte en vez de perderse en silencio. Ese conteo es la señal de
 * que falta enriquecer identidad (por `findCliente`), no un error.
 */
export async function sincronizarLlamadas(
  c: PoolClient,
  prov: ProveedorContactCenter,
  nucleo: NucleoIngesta,
  rango: { desde: string; hasta: string },
): Promise<ResumenSync> {
  const pagina = await prov.listarLlamadas(rango.desde, rango.hasta);
  let ingestadas = 0, sinTelefono = 0;
  for (const ll of pagina.datos) {
    if (!ll.personaTelefono) { sinTelefono++; continue; }
    const persona = await nucleo.asegurarPersona(c, "telefono", ll.personaTelefono);
    await nucleo.registrarInteraccion(c, {
      personaId: persona.id,
      tipo: "llamada",
      moduloOrigen: "conector",
      ocurrioEn: ll.ocurrioEn,
      objetoTipo: "llamada",
      objetoId: ll.id,
      resumen: resumenLlamada(ll),
      dedupeId: `xc:llamada:${ll.id}`,
      meta: { sentido: ll.sentido, estado: ll.estado, duracionSeg: ll.duracionSeg, agente: ll.agente, cola: ll.cola },
    });
    ingestadas++;
  }
  return { leidas: pagina.datos.length, ingestadas, sinTelefono };
}
