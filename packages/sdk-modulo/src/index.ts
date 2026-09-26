import type { PoolClient } from "pg";
import type { Manifiesto } from "@xhub/core";

/**
 * SDK de módulos. Lo que un módulo del repo xhub-modulos (xTickets, xCRM)
 * implementa para enchufarse a xHub SIN base propia (ADR 0009).
 *
 * El módulo declara su manifiesto y, sobre todo, cómo ESCRIBE en la espina dorsal
 * del núcleo (personas, interacciones, enlaces) — nunca guarda contactos por su
 * cuenta. Sus objetos propios (ticket, oportunidad) sí son suyos.
 */
export interface DefinicionModulo {
  manifiesto: Manifiesto;
  /** Migraciones propias del módulo (para SUS objetos, no para personas). */
  migraciones?: string[];
  /** Consumidores de eventos del outbox (idempotentes). */
  consumidores?: ConsumidorEvento[];
  /** Rutas que el módulo registra en la API. */
  rutas?: RutaModulo[];
}

export interface ConsumidorEvento {
  tipo: string;                  // "persona.fusionada", "ticket.creado"...
  consumidor: string;            // nombre único para entrega única
  manejar: (c: PoolClient, evento: EventoRecibido) => Promise<void>;
}

export interface EventoRecibido { id: string; tipo: string; clienteId: string | null; payload: unknown; }

export interface RutaModulo {
  metodo: "GET" | "POST" | "PUT" | "DELETE";
  ruta: string;                  // relativa a /v1/<modulo>
  scope: string;                 // scope requerido (techo por entitlement)
}

/**
 * El acceso al núcleo que el SDK entrega a un módulo. Es la ÚNICA vía por la que un
 * módulo toca la espina dorsal: no importa tablas del núcleo directamente.
 */
export interface NucleoApi {
  asegurarPersona: (c: PoolClient, canal: string, valor: string, nombre?: string) => Promise<{ id: string }>;
  registrarInteraccion: (c: PoolClient, e: { personaId: string; tipo: string; moduloOrigen: string; objetoTipo?: string; objetoId?: string; resumen?: string; dedupeId?: string }) => Promise<{ id: string }>;
  enlazar: (c: PoolClient, ot: string, oi: string, te: string, dt: string, di: string) => Promise<void>;
}

/** Valida que un módulo esté bien formado antes de registrarlo. */
export function validarDefinicion(d: DefinicionModulo): void {
  const m = d.manifiesto;
  if (!m.nombre) throw new Error("El módulo debe declarar un nombre");
  if (m.nombre === "nucleo" || m.nombre === "plataforma")
    throw new Error(`"${m.nombre}" es reservado del núcleo, no puede ser un módulo`);
  const scopes = (d.rutas ?? []).map((r) => r.scope);
  for (const s of scopes)
    if (!m.permisos.includes(s))
      throw new Error(`La ruta declara el scope "${s}" que el manifiesto no lista en permisos`);
  const cons = new Set<string>();
  for (const c of d.consumidores ?? []) {
    if (cons.has(c.consumidor)) throw new Error(`Consumidor duplicado: ${c.consumidor}`);
    cons.add(c.consumidor);
  }
}
