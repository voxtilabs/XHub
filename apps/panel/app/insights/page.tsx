"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getInsights, type Insights } from "@/lib/crm";

const clp = (n: number) => "$" + n.toLocaleString("es-CL");

export default function InsightsPage() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="crm.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const [m, setM] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getInsights().then(setM).catch((e) => setError((e as Error).message)); }, []);
  const maxV = m ? Math.max(1, ...m.porEtapa.map((e) => e.valor)) : 1;

  return (
    <div className="xhub-page xhub-crm-page crm-insights-page">
      <div className="xhub-page-heading"><div><div className="xhub-eyebrow">INTELIGENCIA COMERCIAL</div><h1>Insights</h1><p>Una mirada clara al pulso de tus negocios.</p></div></div>
      {error && <div role="alert" className="crm-error mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" /> {error}</div>}
      {!m ? <div className="crm-loading" role="status"><Icon name="spinner-gap" />Cargando indicadores…</div> : (
        <>
          <div className="crm-insight-summary">
            {([["Forecast ponderado", clp(m.forecast), "--senal", "chart-line"], ["Ganado", clp(m.ganadas.valor), "--exito", "check-circle"], ["Tasa de conversión", m.tasaConversion + "%", "--senal", "gauge"], ["Leads activos", m.leadsActivos, "--aviso", "user-plus"]] as const).map(([l, v, col, icon]) => (
              <Card key={l} className="crm-insight-card"><CardContent className="pt-6"><span className="crm-summary-icon"><Icon name={icon} weight="regular" /></span>
                <div className="text-2xl sm:text-3xl font-semibold tabular-nums" style={{ color: `hsl(var(${col}))` }}>{v}</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <Card className="crm-insight-chart"><CardContent className="pt-6">
            <div className="crm-section-title"><Icon name="chart-line" weight="regular" /><h2>Valor por etapa</h2></div><p className="crm-section-description">Oportunidades abiertas y probabilidad de cierre.</p>
            <div className="space-y-2.5">
              {m.porEtapa.map((e) => (
                <div key={e.nombre} className="crm-chart-row">
                  <span className="crm-chart-label">{e.nombre} <span className="text-[10px]">{e.probabilidad}%</span></span>
                  <div className="crm-chart-track"><span className="block h-full rounded-pill" style={{ width: `${(e.valor / maxV) * 100}%`, background: "hsl(var(--senal))" }} /></div>
                  <span className="crm-chart-value tabular-nums">{clp(e.valor)}</span>
                  <span className="crm-chart-count tabular-nums">{e.n} <span>oportunidades</span></span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
