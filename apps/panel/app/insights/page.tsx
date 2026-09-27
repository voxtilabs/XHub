"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
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
    <div className="max-w-5xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Insights</h1>
      <p className="text-muted-foreground text-sm mb-5">El pulso comercial: forecast ponderado, embudo y conversión.</p>
      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
      {!m ? <div className="text-sm text-muted-foreground font-mono py-8">Cargando…</div> : (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            {([["Forecast ponderado", clp(m.forecast), "--senal"], ["Ganado", clp(m.ganadas.valor), "--exito"], ["Tasa de conversión", m.tasaConversion + "%", "--senal"], ["Leads activos", m.leadsActivos, "--aviso"]] as const).map(([l, v, col]) => (
              <Card key={l} className="flex-1 min-w-[150px]"><CardContent className="pt-6">
                <div className="text-2xl sm:text-3xl font-semibold tabular-nums" style={{ color: `hsl(var(${col}))` }}>{v}</div>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mt-1">{l}</div>
              </CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="pt-6">
            <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">Valor por etapa (abiertas)</div>
            <div className="space-y-2.5">
              {m.porEtapa.map((e) => (
                <div key={e.nombre} className="flex items-center gap-3">
                  <span className="w-28 text-[12.5px] text-muted-foreground shrink-0 truncate">{e.nombre} <span className="text-[10px]">{e.probabilidad}%</span></span>
                  <div className="flex-1 h-2.5 rounded-pill bg-secondary overflow-hidden"><span className="block h-full rounded-pill" style={{ width: `${(e.valor / maxV) * 100}%`, background: "hsl(var(--senal))" }} /></div>
                  <span className="w-24 text-right tabular-nums text-[12.5px]">{clp(e.valor)}</span>
                  <span className="w-8 text-right tabular-nums text-[11px] text-muted-foreground">{e.n}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
