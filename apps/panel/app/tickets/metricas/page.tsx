"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getMetricas } from "@/lib/tickets";

type Met = { porEstado: Record<string, number>; porPrioridad: Record<string, number>; abiertos: number; vencidos: number; csat: { prom: number; n: number } };
const estColor: Record<string, string> = { nuevo: "--senal", abierto: "--aviso", pendiente: "--muted-foreground", resuelto: "--exito", cerrado: "--muted-foreground" };
const priColor: Record<string, string> = { baja: "--senal", media: "--senal", alta: "--aviso", urgente: "--critico" };

export default function Metricas() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="bandeja.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Barras({ datos, colores }: { datos: Record<string, number>; colores: Record<string, string> }) {
  const total = Math.max(1, Object.values(datos).reduce((a, b) => a + b, 0));
  const filas = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  if (filas.length === 0) return <div className="text-[13px] text-muted-foreground">Sin datos aún.</div>;
  return (
    <div className="space-y-2.5">
      {filas.map(([k, n]) => (
        <div key={k} className="flex items-center gap-3">
          <span className="w-20 text-[12.5px] capitalize text-muted-foreground shrink-0">{k}</span>
          <div className="flex-1 h-2.5 rounded-pill bg-secondary overflow-hidden">
            <span className="block h-full rounded-pill" style={{ width: `${(n / total) * 100}%`, background: `hsl(var(${colores[k] ?? "--senal"}))` }} />
          </div>
          <span className="w-8 text-right tabular-nums text-[13px] font-medium">{n}</span>
        </div>
      ))}
    </div>
  );
}

function Contenido() {
  const [m, setM] = useState<Met | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getMetricas().then(setM).catch((e) => setError((e as Error).message)); }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Métricas</h1>
      <p className="text-muted-foreground text-sm mb-5">El pulso de tu operación de soporte, en vivo.</p>
      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
      {!m ? <div className="text-sm text-muted-foreground font-mono py-8">Cargando…</div> : (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            {([["Abiertos", m.abiertos, "--aviso"], ["SLA vencidos", m.vencidos, m.vencidos > 0 ? "--critico" : "--exito"], ["CSAT", m.csat.n ? `${m.csat.prom}★` : "—", "--senal"], ["Calificaciones", m.csat.n, "--muted-foreground"]] as const).map(([l, n, col]) => (
              <Card key={l} className="flex-1 min-w-[150px]"><CardContent className="pt-6">
                <div className="text-3xl font-semibold tabular-nums" style={{ color: `hsl(var(${col}))` }}>{n}</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card><CardContent className="pt-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Tickets por estado</div>
              <Barras datos={m.porEstado} colores={estColor} />
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Tickets por prioridad</div>
              <Barras datos={m.porPrioridad} colores={priColor} />
            </CardContent></Card>
          </div>
        </>
      )}
    </div>
  );
}
