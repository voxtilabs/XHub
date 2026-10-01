"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getMetricas } from "@/lib/tickets";

type KN = { k: string; n: number };
type Met = {
  porEstado: Record<string, number>; porPrioridad: Record<string, number>;
  abiertos: number; vencidos: number; csat: { prom: number; n: number };
  porCategoria: KN[]; porCanal: KN[]; resolucion: { horas: number; n: number };
  serie: { dia: string; n: number }[]; totalCreados: number; resueltos: number;
};
const estColor: Record<string, string> = { nuevo: "--senal", abierto: "--aviso", pendiente: "--muted-foreground", resuelto: "--exito", cerrado: "--muted-foreground" };
const priColor: Record<string, string> = { baja: "--senal", media: "--senal", alta: "--aviso", urgente: "--critico" };
const aRecord = (xs: KN[]): Record<string, number> => Object.fromEntries(xs.map((x) => [x.k, x.n]));

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

// Tendencia 14 días: sparkline de barras (cuentas por día). Tokens del diseño.
function Tendencia({ serie }: { serie: { dia: string; n: number }[] }) {
  if (!serie.length) return <div className="text-[13px] text-muted-foreground">Sin tickets en los últimos 14 días.</div>;
  const max = Math.max(1, ...serie.map((d) => d.n));
  const total = serie.reduce((a, b) => a + b.n, 0);
  return (
    <div>
      <div className="flex items-end gap-1 h-24" role="img" aria-label={`Tickets creados por día, ${total} en 14 días`}>
        {serie.map((d) => (
          <div key={d.dia} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.dia}: ${d.n}`}>
            <span className="w-full rounded-t-[3px]" style={{ height: `${Math.max(4, (d.n / max) * 100)}%`, background: "hsl(var(--senal))", opacity: d.n ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 tabular-nums">
        <span>{serie[0]?.dia.slice(5)}</span><span>{total} en 14 días</span><span>{serie[serie.length - 1]?.dia.slice(5)}</span>
      </div>
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
            {([
              ["Abiertos", m.abiertos, "--aviso"],
              ["SLA vencidos", m.vencidos, m.vencidos > 0 ? "--critico" : "--exito"],
              ["Tasa resolución", m.totalCreados ? `${Math.round((m.resueltos / m.totalCreados) * 100)}%` : "—", "--exito"],
              ["Tiempo medio", m.resolucion.n ? `${m.resolucion.horas}h` : "—", "--senal"],
              ["CSAT", m.csat.n ? `${m.csat.prom}★` : "—", "--senal"],
              ["Total tickets", m.totalCreados, "--muted-foreground"],
            ] as const).map(([l, n, col]) => (
              <Card key={l} className="flex-1 min-w-[140px]"><CardContent className="pt-6">
                <div className="text-3xl font-semibold tabular-nums" style={{ color: `hsl(var(${col}))` }}>{n}</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <Card className="mb-4"><CardContent className="pt-6">
            <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Tickets creados · últimos 14 días</div>
            <Tendencia serie={m.serie} />
          </CardContent></Card>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card><CardContent className="pt-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Por estado</div>
              <Barras datos={m.porEstado} colores={estColor} />
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Por prioridad</div>
              <Barras datos={m.porPrioridad} colores={priColor} />
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Por categoría</div>
              <Barras datos={aRecord(m.porCategoria)} colores={{}} />
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Por canal</div>
              <Barras datos={aRecord(m.porCanal)} colores={{}} />
            </CardContent></Card>
          </div>
        </>
      )}
    </div>
  );
}
