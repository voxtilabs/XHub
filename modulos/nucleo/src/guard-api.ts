import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { resolverLlave } from "./apikeys.js";
import { entitlementsDe } from "./entitlements.js";

/**
 * Catálogo de alcances (scopes) de la API pública. UNA sola fuente de verdad: el
 * panel del superadmin ofrece estos al crear una llave y el OpenAPI los documenta
 * desde aquí. `modulo` es el entitlement que debe estar encendido para que el scope
 * valga (nucleo va siempre). No se declara un scope que no esté en esta lista.
 */
export interface ScopeDef { scope: string; modulo: string; descripcion: string; }
export const CATALOGO_SCOPES: ScopeDef[] = [
  { scope: "nucleo.leer", modulo: "nucleo", descripcion: "Ficha 360 y búsqueda de personas." },
  { scope: "nucleo.administrar", modulo: "nucleo", descripcion: "Supresión de datos del titular (Ley 21.719)." },
  { scope: "tickets.leer", modulo: "tickets", descripcion: "Bandeja y contexto de tickets." },
  { scope: "tickets.crear", modulo: "tickets", descripcion: "Crear tickets." },
  { scope: "tickets.responder", modulo: "tickets", descripcion: "Cambiar estado y pedir respuesta sugerida." },
  { scope: "tickets.asignar", modulo: "tickets", descripcion: "Asignar tickets a un usuario." },
  { scope: "crm.leer", modulo: "crm", descripcion: "Leer embudos, oportunidades, organizaciones, prospectos e insights." },
  { scope: "crm.escribir", modulo: "crm", descripcion: "Crear y actualizar oportunidades, organizaciones, prospectos y actividades." },
];
export const SCOPES_VALIDOS = new Set(CATALOGO_SCOPES.map((s) => s.scope));

export interface ContextoApi {
  clienteId: string;
  llaveId: string;
  scopes: string[];
  entitlements: Set<string>;
}

/**
 * Autentica una petición de la API pública del cliente por su llave, y arma su
 * contexto: cliente (DE LA LLAVE), scopes y módulos encendidos. El scope es un
 * TECHO: no puede exceder los entitlements del cliente. Un scope de un módulo
 * apagado no vale, aunque la llave lo declare.
 */
export async function autenticarApi(c: PoolClient, token: string): Promise<ContextoApi> {
  const llave = await resolverLlave(c, token);
  const entitlements = await entitlementsDe(c, llave.clienteId);
  // los scopes efectivos son los declarados que además tienen su módulo encendido
  const scopes = llave.scopes.filter((s) => {
    const modulo = s.split(".")[0];
    return entitlements.has(modulo) || modulo === "nucleo";
  });
  return { clienteId: llave.clienteId, llaveId: llave.id, scopes, entitlements };
}

/** Exige un scope o lanza SIN_PERMISO. El scope ya está acotado por entitlements. */
export function exigirScope(ctx: ContextoApi, scope: string): void {
  if (!ctx.scopes.includes(scope)) {
    const modulo = scope.split(".")[0];
    if (!ctx.entitlements.has(modulo))
      throw new ErrorApi("SIN_PERMISO", `El módulo "${modulo}" no está habilitado para este cliente`, { modulo });
    throw new ErrorApi("SIN_PERMISO", `La llave no tiene el scope: ${scope}`, { scope });
  }
}
