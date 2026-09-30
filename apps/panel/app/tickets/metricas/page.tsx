"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
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
    <div className="xhub-ticket-metric-bars space-y-2.5">
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
    <div className="xhub-page xhub-ticket-metrics">
      <div className="xhub-page-heading"><div><div className="xhub-eyebrow">Inteligencia de atención</div><h1>Métricas</h1><p>El pulso de tu operación de soporte, en vivo.</p></div></div>
      {error && <div role="alert" className="xhub-ticket-alert mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" />{error}</div>}
      {!m ? <div className="text-sm text-muted-foreground font-mono py-8">Cargando…</div> : (
        <>
          <div className="xhub-ticket-metrics-grid flex flex-wrap gap-3 mb-5">
            {([["Abiertos", m.abiertos, "--aviso"], ["SLA vencidos", m.vencidos, m.vencidos > 0 ? "--critico" : "--exito"], ["CSAT", m.csat.n ? `${m.csat.prom}★` : "—", "--senal"], ["Calificaciones", m.csat.n, "--muted-foreground"]] as const).map(([l, n, col]) => (
              <Card key={l} className="xhub-ticket-metric-card flex-1 min-w-[150px]"><CardContent className="pt-6">
                <span className="xhub-ticket-card-glyph" data-tone={l === "SLA vencidos" && m.vencidos > 0 ? "critical" : undefined}><Icon name={l === "Abiertos" ? "chats-circle" : l === "SLA vencidos" ? "warning-circle" : l === "CSAT" ? "user-circle" : "list-checks"} weight="regular" /></span>
                <div className="xhub-ticket-metric-number text-3xl font-semibold tabular-nums" style={{ color: `hsl(var(${col}))` }}>{n}</div>
                <div className="xhub-ticket-metric-label text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="xhub-ticket-chart"><CardContent className="pt-6">
              <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="chart-line" weight="regular" /></span><div><h2>Tickets por estado</h2><p>Una vista clara de tu carga de atención.</p></div></div>
              <Barras datos={m.porEstado} colores={estColor} />
            </CardContent></Card>
            <Card className="xhub-ticket-chart"><CardContent className="pt-6">
              <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="flag" weight="regular" /></span><div><h2>Tickets por prioridad</h2><p>Identifica dónde enfocar al equipo.</p></div></div>
              <Barras datos={m.porPrioridad} colores={priColor} />
            </CardContent></Card>
          </div>
        </>
      )}
    </div>
  );
}
