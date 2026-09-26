import { RegistroModulos } from "./registro.js";

/**
 * Traductor de roles → permisos. EL ÚNICO lugar donde un rol se convierte en
 * permisos (ADR 0006). Ninguna otra parte del código pregunta por el rol.
 *
 * Dos poblaciones separadas:
 *  - roles de cliente (ADMIN, SUPERVISOR, USER) → permisos de sus módulos
 *  - administradores de plataforma → permisos platform.* (viven aparte, #f1-superadmin)
 */
export type RolCliente = "ADMIN" | "SUPERVISOR" | "USER";

// Qué "nivel" de permiso de cada módulo recibe cada rol. El módulo declara sus
// permisos; aquí solo se decide el alcance por rol, no se listan a mano.
const ALCANCE: Record<RolCliente, (permiso: string) => boolean> = {
  // ADMIN: todo lo de sus módulos activos.
  ADMIN: () => true,
  // SUPERVISOR: todo menos lo marcado .manage (administración del módulo).
  SUPERVISOR: (p) => !p.endsWith(".manage"),
  // USER: solo lo básico: leer/crear/responder de lo suyo.
  USER: (p) => /\.(leer|crear|responder|ver)$/.test(p),
};

export interface Actor {
  rol: RolCliente;
  entitlements: Set<string>; // módulos encendidos para su cliente
}

/**
 * Permisos efectivos = permisos de los módulos ACTIVOS para el cliente,
 * filtrados por el alcance del rol. Apagar un módulo (quitar su entitlement)
 * retira sus permisos en la siguiente resolución, sin tocar al usuario.
 */
export function permisosDe(actor: Actor, registro: RegistroModulos): Set<string> {
  const activos = new Set(registro.activosPara(actor.entitlements));
  const filtro = ALCANCE[actor.rol];
  const out = new Set<string>();
  for (const m of registro.lista()) {
    if (!activos.has(m.nombre)) continue;
    for (const p of m.permisos) if (filtro(p)) out.add(p);
  }
  return out;
}

/** ¿El actor puede? Nunca se pregunta por el rol fuera de aquí. */
export function puede(actor: Actor, permiso: string, registro: RegistroModulos): boolean {
  return permisosDe(actor, registro).has(permiso);
}
