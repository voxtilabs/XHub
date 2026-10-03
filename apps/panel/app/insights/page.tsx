"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getInsights, type Insights } from "@/lib/crm";
import { HeroFeatures } from "@/components/hero-features";

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
  const valorAbierto = m?.porEtapa.reduce((total, etapa) => total + etapa.valor, 0) ?? 0;
  const oportunidadesAbiertas = m?.porEtapa.reduce((total, etapa) => total + etapa.n, 0) ?? 0;

  return (
    <div className="xhub-page xhub-crm-page crm-insights-page">
      <div className="xhub-page-heading" data-hero="analytics"><div><div className="xhub-eyebrow">INTELIGENCIA COMERCIAL</div><h1>Insights</h1><p>Una mirada clara al pulso de tus negocios.</p><HeroFeatures variant="insights" />
          </div></div>
      {error && <div role="alert" className="crm-error mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" /> {error}</div>}
      {!m ? <div className="crm-loading" role="status"><Icon name="spinner-gap" />Cargando indicadores…</div> : (
        <>
          <div className="crm-insight-summary">
            {([["Forecast ponderado", clp(m.forecast), "--senal", "chart-line"], ["Ganado", clp(m.ganadas.valor), "--exito", "check-circle"], ["Tasa de conversión", m.tasaConversion + "%", "--senal", "gauge"], ["Leads activos", m.leadsActivos, "--aviso", "user-plus"]] as const).map(([l, v, col, icon]) => (
              <Card key={l} className="crm-insight-card"><CardContent className="pt-6"><span className="crm-summary-icon"><Icon name={icon} weight="duotone" /></span>
                <div className="text-2xl sm:text-3xl font-semibold tabular-nums" style={{ color: `hsl(var(${col}))` }}>{v}</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <Card className="crm-insight-chart crm-stage-analysis"><CardContent className="crm-stage-content">
            <header className="crm-stage-heading">
              <div className="crm-stage-intro">
                <div className="crm-stage-kicker"><Icon name="chart-line" /> DISTRIBUCIÓN COMERCIAL</div>
                <h2>Valor por etapa</h2>
                <p>El valor de tus oportunidades, en cada momento del negocio.</p>
              </div>
              <dl className="crm-stage-overview">
                <div><dt>Valor abierto</dt><dd>{clp(valorAbierto)}</dd></div>
                <div><dt>Oportunidades</dt><dd>{oportunidadesAbiertas}</dd></div>
                <div><dt>Etapas</dt><dd>{m.porEtapa.length}</dd></div>
              </dl>
            </header>

            {valorAbierto === 0 && m.porEtapa.length > 0 && <div className="crm-stage-zero-note"><Icon name="info" /><p>{oportunidadesAbiertas > 0 ? `Hay ${oportunidadesAbiertas} ${oportunidadesAbiertas === 1 ? "oportunidad abierta" : "oportunidades abiertas"}, con un valor acumulado de $0.` : "Todavía no hay oportunidades abiertas en estas etapas."}</p></div>}

            <div className="crm-stage-grid">
              {m.porEtapa.map((e) => {
                const probabilidad = Math.min(100, Math.max(0, e.probabilidad));
                const participacion = valorAbierto > 0 ? (e.valor / valorAbierto) * 100 : 0;
                return (
                  <article key={e.nombre} className="crm-stage-card" data-populated={e.n > 0} aria-label={e.nombre}>
                    <header className="crm-stage-card-heading"><h3>{e.nombre}</h3><span className="crm-stage-count">{e.n} {e.n === 1 ? "oportunidad" : "oportunidades"}</span></header>
                    <div className="crm-stage-card-body">
                      <div className="crm-stage-value"><span>Valor acumulado</span><strong>{clp(e.valor)}</strong></div>
                      <div className="crm-stage-probability">
                        <div className="crm-stage-ring">
                          <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="crm-stage-ring-track" cx="32" cy="32" r="27" /><circle className="crm-stage-ring-fill" cx="32" cy="32" r="27" pathLength="100" strokeDasharray={`${probabilidad} 100`} transform="rotate(-90 32 32)" data-zero={probabilidad === 0} /></svg>
                          <span>{e.probabilidad}<small>%</small></span>
                        </div>
                        <span className="crm-stage-probability-label">Probabilidad<br />de la etapa</span>
                      </div>
                    </div>
                    {valorAbierto > 0 && <div className="crm-stage-share"><div><span>Del valor abierto</span><strong>{participacion.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</strong></div><div className="crm-stage-share-track" aria-hidden="true"><span style={{ width: `${participacion}%` }} /></div></div>}
                  </article>
                );
              })}
            </div>
            {m.porEtapa.length === 0 && <div className="crm-stage-empty"><Icon name="kanban" /><h3>Sin etapas para mostrar</h3><p>La distribución aparecerá cuando haya etapas disponibles.</p></div>}
            <footer className="crm-stage-footnote"><Icon name="gauge" /><span>Las probabilidades están configuradas por etapa; no representan la tasa de conversión real.</span></footer>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
