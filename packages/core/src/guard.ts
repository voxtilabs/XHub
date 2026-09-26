import { ErrorApi } from "./errores.js";
import { puede, type Actor } from "./permisos.js";
import type { RegistroModulos } from "./registro.js";

/** Exige un permiso o lanza ErrorApi. Nunca pregunta por el rol (ADR 0006). */
export function exigir(actor: Actor, permiso: string, registro: RegistroModulos): void {
  if (!puede(actor, permiso, registro))
    throw new ErrorApi("SIN_PERMISO", `Falta el permiso: ${permiso}`, { permiso });
}
