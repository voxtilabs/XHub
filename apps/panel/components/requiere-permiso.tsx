"use client";
import type { ReactNode } from "react";
import { useYo } from "@/lib/permisos";

/**
 * Cerca por permiso. Envuelve el contenido de una consola: si el usuario no tiene el
 * permiso, ve un aviso claro en vez de la pantalla. Así, encender/apagar un permiso en
 * "Mi equipo" cambia lo que el agente PUEDE hacer, no solo un interruptor decorativo.
 */
export function RequierePermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const { yo, cargando, puede } = useYo();
  if (cargando) return <div className="max-w-3xl mx-auto p-10 text-sm text-muted-foreground font-mono">Cargando permisos…</div>;
  // Sin identidad de cliente (p.ej. plataforma sin sesión de cliente): no gateamos aquí.
  if (!yo) return <>{children}</>;
  if (puede(permiso)) return <>{children}</>;
  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 h-11 w-11 rounded-full grid place-items-center" style={{ background: "hsl(var(--aviso)/0.12)" }}>
          <svg className="h-5 w-5" style={{ color: "hsl(var(--aviso))" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div className="font-medium">No tienes acceso a esta sección</div>
        <p className="text-[13px] text-muted-foreground mt-1.5">
          Te falta el permiso <code className="text-[12px] px-1 py-0.5 rounded bg-secondary">{permiso}</code>.
          Pídele a tu administrador que te lo active en <b>Mi equipo</b>.
        </p>
      </div>
    </div>
  );
}
