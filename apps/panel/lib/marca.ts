"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/** Marca blanca del cliente. La plataforma la fija; el panel del cliente se pinta. */
export type Marca = { nombre_marca: string | null; logo_url: string | null; color_primario: string | null; color_acento: string | null };

/** #rrggbb → "H S% L%" para las variables --primary/--senal (que el CSS usa como hsl()). */
export function hexAHslTriplet(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Aplica la marca del cliente logueado como variables CSS y devuelve logo/nombre. */
export function useMarca() {
  const [marca, setMarca] = useState<Marca | null>(null);
  useEffect(() => {
    let vivo = true;
    apiFetch<Marca>("/cliente/marca").then((m) => {
      if (!vivo) return;
      setMarca(m);
      const root = document.documentElement;
      const p = m.color_primario ? hexAHslTriplet(m.color_primario) : null;
      const a = m.color_acento ? hexAHslTriplet(m.color_acento) : null;
      if (p) { root.style.setProperty("--primary", p); root.style.setProperty("--ring", p); }
      if (a) root.style.setProperty("--senal", a);
    }).catch(() => { /* plataforma o sin marca: tema por defecto */ });
    return () => { vivo = false; };
  }, []);
  return marca;
}
