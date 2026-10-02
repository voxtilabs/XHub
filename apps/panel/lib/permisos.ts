"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Identidad + permisos del usuario logueado (GET /cliente/yo). El panel gobierna la
 * navegación y el acceso POR PERMISO, no por rol (ley de la casa nº 6): apagarle
 * "bandeja.ver" a un agente le quita la bandeja en la siguiente carga, de verdad.
 */
export type Yo = {
  id: string; email: string | null; nombre: string | null;
  rol: string; clienteId: string | null; esAdmin: boolean; permisos: string[];
  esSoporte?: boolean; motivoSoporte?: string; modulos?: string[];
};

export function useYo() {
  const [yo, setYo] = useState<Yo | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let vivo = true;
    apiFetch<Yo>("/cliente/yo")
      .then((y) => { if (vivo) setYo(y); })
      .catch(() => { if (vivo) setYo(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);
  // Acceso total para plataforma y admin de cliente; el agente, por su lista de permisos.
  const puede = (p: string) => !!yo && (yo.esAdmin || yo.rol === "plataforma" || yo.permisos.includes(p));
  return { yo, cargando, puede };
}
