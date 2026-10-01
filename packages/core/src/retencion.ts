/**
 * Retención de datos por plan (#105). El plan fija el TECHO de días a conservar; la
 * excepción por cliente solo puede ACORTAR, nunca exceder lo permitido por el plan.
 *
 *   null  = ilimitado (no se purga nada)
 *   N > 0 = se conservan N días; lo anterior al corte se purga
 *   <= 0  = se trata como no-configurado (ilimitado) — nunca "borra todo ya" por error
 */
export function retencionEfectiva(planDias: number | null | undefined, clienteDias: number | null | undefined): number | null {
  const norm = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);
  const plan = norm(planDias);
  const cliente = norm(clienteDias);
  if (cliente == null) return plan;        // sin excepción → rige el plan
  if (plan == null) return cliente;        // plan ilimitado → la excepción (finita) es más corta, vale
  return Math.min(cliente, plan);          // la excepción no puede exceder el techo del plan
}
