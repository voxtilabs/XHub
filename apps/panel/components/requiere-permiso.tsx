"use client";
import { Icon } from "@/components/icon";
import type { ReactNode } from "react";
import { useYo } from "@/lib/permisos";

/**
 * Cerca por permiso. Envuelve el contenido de una consola: si el usuario no tiene el
 * permiso, ve un aviso claro en vez de la pantalla. Así, encender/apagar un permiso en
 * "Mi equipo" cambia lo que el agente PUEDE hacer, no solo un interruptor decorativo.
 */
export function RequierePermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const { yo, cargando, puede } = useYo();
  if (cargando) return <div className="max-w-3xl mx-auto p-10 flex items-center gap-3 text-sm text-muted-foreground font-mono"><Icon name="spinner-gap" className="animate-spin text-xl" />Cargando permisos…</div>;
  // Sin identidad de cliente (p.ej. plataforma sin sesión de cliente): no gateamos aquí.
  if (!yo) return <>{children}</>;
  if (puede(permiso)) return <>{children}</>;
  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 h-11 w-11 rounded-full grid place-items-center" style={{ background: "hsl(var(--aviso)/0.12)" }}>
          <Icon name="lock-key" className="text-xl text-[hsl(var(--aviso))]" />
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
