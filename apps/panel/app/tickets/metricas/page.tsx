"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getMetricas } from "@/lib/tickets";
import { HeroFeatures } from "@/components/hero-features";

type KN = { k: string; n: number };
type Met = {
  porEstado: Record<string, number>; porPrioridad: Record<string, number>;
  abiertos: number; vencidos: number; csat: { prom: number; n: number };
  porCategoria: KN[]; porCanal: KN[]; resolucion: { horas: number; n: number };
  serie: { dia: string; n: number }[]; totalCreados: number; resueltos: number;
};
const estColor: Record<string, string> = { nuevo: "hsl(var(--senal))", abierto: "var(--voxia-action-text)", pendiente: "hsl(var(--muted-foreground))", resuelto: "hsl(var(--exito))", cerrado: "hsl(var(--muted-foreground))" };
const priColor: Record<string, string> = { baja: "hsl(var(--senal))", media: "hsl(var(--senal))", alta: "hsl(var(--aviso))", urgente: "hsl(var(--critico))" };
const aRecord = (xs: KN[]): Record<string, number> => Object.fromEntries(xs.map((x) => [x.k, x.n]));

export default function Metricas() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="bandeja.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

type DistributionKind = "estado" | "prioridad" | "categoria" | "canal";
const distributionIcons: Record<string, string> = { nuevo: "ticket", abierto: "chats-circle", pendiente: "clock", resuelto: "check-circle", cerrado: "lock-key", email: "envelope", webchat: "chat-circle-dots", whatsapp: "whatsapp-logo", telefono: "phone", llamada: "phone" };
const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const priorityIcons: Record<string, string> = { baja: "arrow-down", media: "equals", alta: "arrow-up", urgente: "warning-circle" };

function distributionSymbol(kind: DistributionKind, label: string) {
  if (kind === "prioridad") return priorityIcons[label] ?? "flag-banner";
  if (kind === "categoria") return label.toLocaleLowerCase("es") === "(sin categoría)" ? "folder-simple-dashed" : "folder-simple";
  return label === "email" ? "envelope-simple" : distributionIcons[label] ?? "broadcast";
}

function Barras({ datos, colores, variant }: { datos: Record<string, number>; colores: Record<string, string>; variant: DistributionKind }) {
  const total = Math.max(1, Object.values(datos).reduce((a, b) => a + b, 0));
  const filas = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  const registrados = Object.values(datos).reduce((a, b) => a + b, 0);
  if (filas.length === 0 || registrados === 0) return <div className="xhub-metric-empty"><Icon name="chart-line" weight="regular" /><strong>Sin datos todavía</strong><p>La distribución aparecerá cuando haya tickets registrados.</p></div>;
  let acumulado = 0;
  const segmentos = filas.map(([k, n]) => {
    const inicio = acumulado;
    acumulado += (n / total) * 100;
    return `${colores[k] ?? "hsl(var(--senal))"} ${inicio}% ${acumulado}%`;
  });
  return (
    <div className="xhub-distribution" data-kind={variant}>
      <div className="xhub-distribution-total"><strong>{registrados}</strong><span>{registrados === 1 ? "ticket contabilizado" : "tickets contabilizados"}</span></div>
      <div className="xhub-distribution-body">
        {variant === "estado" && <div className="xhub-distribution-donut" style={{ background: `conic-gradient(${segmentos.join(",")})` }} role="img" aria-label={`Distribución por estado: ${filas.map(([k, n]) => `${k}, ${n}`).join("; ")}`}><div><strong>{registrados}</strong><span>{registrados === 1 ? "ticket" : "tickets"}</span></div></div>}
        <ul className="xhub-distribution-list">
          {filas.map(([k, n]) => (
            <li key={k} className="xhub-distribution-row" style={{ "--row-color": colores[k] ?? "hsl(var(--senal))" } as CSSProperties}>
              <div className="xhub-distribution-row-head"><span className="xhub-distribution-label">{variant === "estado" ? <Icon name={distributionIcons[k] ?? "chat-circle"} weight="regular" /> : <span className="xhub-distribution-symbol"><Icon name={distributionSymbol(variant, k)} weight="duotone" /></span>}<span>{k}</span></span><span className="xhub-distribution-value"><strong>{n}</strong><small>{Math.round((n / total) * 100)}%</small></span></div>
              <div className="xhub-distribution-track" aria-hidden="true"><span style={{ width: `${(n / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
      <p className="xhub-distribution-footnote">{variant === "categoria" || variant === "canal" ? "Porcentaje de los grupos mostrados · hasta 8 principales" : "Porcentaje del total de tickets"}</p>
    </div>
  );
}

// The API already groups the rolling 14-day window by civil dates in Santiago.
// Keep every returned day (including partial boundary days); never invent points.
function Tendencia({ serie }: { serie: { dia: string; n: number }[] }) {
  if (!serie.length) return <div className="xhub-metric-empty"><Icon name="chart-line" weight="regular" /><strong>Sin actividad en este período</strong><p>No se registraron tickets en los últimos 14 días.</p></div>;
  const max = Math.max(1, ...serie.map((d) => d.n));
  const total = serie.reduce((a, b) => a + b.n, 0);
  const diasActivos = serie.filter((d) => d.n > 0).length;
  const maximoDiario = Math.max(...serie.map((d) => d.n));
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  return (
    <div className="xhub-trend-layout">
      <aside className="xhub-trend-summary">
        <div className="xhub-trend-total"><strong>{total}</strong><span>{total === 1 ? "ticket creado" : "tickets creados"}<br />en los últimos 14 días</span></div>
        <dl className="xhub-trend-facts"><div><dt>Máximo diario</dt><dd>{maximoDiario}<small>{maximoDiario === 1 ? " ticket" : " tickets"}</small></dd></div><div><dt>Días con actividad</dt><dd>{diasActivos}<small>{diasActivos === 1 ? " día" : " días"}</small></dd></div></dl>
      </aside>
      <div className="xhub-trend-chart">
        <div className="xhub-trend-chart-caption"><span>Volumen diario</span><span>Tickets</span></div>
        <div className="xhub-trend-plot" role="group" aria-label={`Tickets creados por día, ${total} en los últimos 14 días`}>
          <div className="xhub-trend-grid" aria-hidden="true">{ticks.map((n) => <div key={n} className="xhub-trend-gridline" style={{ bottom: `${(n / max) * 100}%` }}><span>{n}</span></div>)}</div>
          <div className="xhub-trend-columns">
            {serie.map((d) => (
              <div key={d.dia} className="xhub-trend-column" tabIndex={0} role="img" aria-label={`${d.dia}: ${d.n} ${d.n === 1 ? "ticket" : "tickets"}`} title={`${d.dia}: ${d.n}`}>
                <span className="xhub-trend-bar" data-zero={d.n === 0} style={{ height: `${(d.n / max) * 100}%` }} aria-hidden="true"><span className="xhub-trend-bar-value">{d.n}</span></span>
                <span className="xhub-trend-tooltip" aria-hidden="true"><strong>{d.n}</strong> {d.n === 1 ? "ticket" : "tickets"}<small>{d.dia}</small></span>
              </div>
            ))}
          </div>
        </div>
        <div className="xhub-trend-dates" aria-hidden="true">{serie.map((d, i) => <span key={d.dia}><b>{d.dia.slice(8, 10)}</b><small>{i === 0 || i === serie.length - 1 || d.dia.slice(8, 10) === "01" ? months[Number(d.dia.slice(5, 7)) - 1] : ""}</small></span>)}</div>
        <p className="xhub-trend-note"><span />{serie.length === 1 ? "Un día con registros en este período" : "Cada barra representa una fecha con registros"}</p>
      </div>
    </div>
  );
}

function Contenido() {
  const [m, setM] = useState<Met | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getMetricas().then(setM).catch((e) => setError((e as Error).message)); }, []);

  return (
    <div className="xhub-page xhub-ticket-metrics">
      <div className="xhub-page-heading" data-hero="analytics"><div><div className="xhub-eyebrow">Inteligencia de atención</div><h1>Métricas</h1><p>Una visión clara de tu operación de soporte.</p><HeroFeatures variant="metricas" />
          </div></div>
      {error && <div role="alert" className="xhub-ticket-alert mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="duotone" />{error}</div>}
      {!m ? <div className="text-sm text-muted-foreground font-mono py-8">Cargando…</div> : (
        <>
          <div className="xhub-metric-kicker"><h2>Resumen de atención</h2><span>Indicadores de tu operación</span></div>
          <div className="xhub-ticket-metrics-grid flex flex-wrap gap-3 mb-5">
            {([
              ["Abiertos", m.abiertos, "var(--voxia-action-text)"],
              ["SLA vencidos", m.vencidos, m.vencidos > 0 ? "hsl(var(--critico))" : "hsl(var(--exito))"],
              ["Tasa resolución", m.totalCreados ? `${Math.round((m.resueltos / m.totalCreados) * 100)}%` : "—", "hsl(var(--exito))"],
              ["Tiempo medio", m.resolucion.n ? `${m.resolucion.horas}h` : "—", "hsl(var(--senal))"],
              ["CSAT", m.csat.n ? `${m.csat.prom}★` : "—", "hsl(var(--senal))"],
              ["Total tickets", m.totalCreados, "hsl(var(--muted-foreground))"],
              ["Calificaciones", m.csat.n, "hsl(var(--muted-foreground))"],
            ] as const).map(([l, n, col]) => (
              <Card key={l} className="xhub-ticket-metric-card flex-1 min-w-[140px]" style={{ "--metric-accent": col } as CSSProperties}><CardContent className="pt-6">
                <span className="xhub-ticket-card-glyph" data-tone={l === "SLA vencidos" && m.vencidos > 0 ? "critical" : undefined}><Icon name={l === "Abiertos" ? "chats-circle" : l === "SLA vencidos" ? "warning-circle" : l === "Tiempo medio" ? "clock" : l === "Tasa resolución" ? "check-circle" : l === "CSAT" ? "star" : "list-checks"} weight="duotone" /></span>
                <div className="xhub-ticket-metric-number text-3xl font-semibold tabular-nums" style={{ color: col }}>{n}</div>
                <div className="xhub-ticket-metric-label text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <div className="xhub-metrics-visuals">
          <Card className="xhub-ticket-chart xhub-metric-trend mb-4"><CardContent className="pt-6">
            <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="chart-line" weight="duotone" /></span><div><h2>Tickets creados</h2><p>La evolución diaria de tu atención.</p></div><span className="xhub-metric-period"><Icon name="clock" weight="regular" />Últimos 14 días</span></div>
            <Tendencia serie={m.serie} />
          </CardContent></Card>
          <div className="xhub-metric-distributions">
            <Card className="xhub-ticket-chart xhub-metric-breakdown"><CardContent className="pt-6">
              <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="chart-line" weight="duotone" /></span><div><h2>Tickets por estado</h2><p>Una vista clara de tu carga de atención.</p></div></div>
              <Barras variant="estado" datos={m.porEstado} colores={estColor} />
            </CardContent></Card>
            <Card className="xhub-ticket-chart xhub-metric-breakdown xhub-metric-detail-card" data-report="prioridad"><CardContent className="pt-6">
              <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="flag-banner" weight="duotone" /></span><div><h2>Tickets por prioridad</h2><p>Identifica dónde enfocar al equipo.</p></div></div>
              <Barras variant="prioridad" datos={m.porPrioridad} colores={priColor} />
            </CardContent></Card>
            <Card className="xhub-ticket-chart xhub-metric-breakdown xhub-metric-detail-card" data-report="categoria"><CardContent className="pt-6">
              <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="tag" weight="duotone" /></span><div><h2>Tickets por categoría</h2><p>Los motivos de contacto del equipo.</p></div></div>
              <Barras variant="categoria" datos={aRecord(m.porCategoria)} colores={{}} />
            </CardContent></Card>
            <Card className="xhub-ticket-chart xhub-metric-breakdown xhub-metric-detail-card" data-report="canal"><CardContent className="pt-6">
              <div className="xhub-ticket-card-heading"><span className="xhub-ticket-card-glyph"><Icon name="broadcast" weight="duotone" /></span><div><h2>Tickets por canal</h2><p>De dónde vienen las conversaciones.</p></div></div>
              <Barras variant="canal" datos={aRecord(m.porCanal)} colores={{}} />
            </CardContent></Card>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
