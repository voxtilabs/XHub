"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";

type Resumen = {
  total: number; ok: number; fallidos: number; tokensPrompt: number; tokensSalida: number; msPromedio: number;
  porTarea: { tarea: string; llamadas: number; tokens: number }[];
  porProveedor: { proveedor: string; modelo: string; llamadas: number; tokens: number }[];
  recientes: { tarea: string; proveedor: string; modelo: string; tokens: number; ms: number; ok: boolean; creadoEn: string; clienteId: string | null }[];
};
const num = (n: number) => n.toLocaleString("es-CL");

function Metrica({ etiqueta, valor, sufijo, tono }: { etiqueta: string; valor: string; sufijo?: string; tono?: string }) {
  return (
    <Card className="flex-1 min-w-[150px]"><CardContent className="pt-5">
      <div className="text-[11px] font-black tracking-widest uppercase text-[hsl(var(--senal))]">{etiqueta}</div>
      <div className="text-3xl font-semibold tracking-tight mt-1 tabular-nums" style={tono ? { color: `hsl(var(${tono}))` } : undefined}>
        {valor}{sufijo && <span className="text-base text-muted-foreground ml-1">{sufijo}</span>}
      </div>
    </CardContent></Card>
  );
}

export default function ConsumoIA() {
  const [data, setData] = useState<Resumen | null>(null);
  const [dias, setDias] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    apiFetch<Resumen>(`/admin/ia?dias=${dias}`).then(setData).catch((e) => setError((e as Error).message));
  }, [dias]);

  const tokens = data ? data.tokensPrompt + data.tokensSalida : 0;

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="max-w-5xl mx-auto p-4 sm:p-8 flex flex-col gap-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Actividad de IA</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Qué hizo la IA y cuánto consumió, en toda la plataforma.</p>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDias(d)}
                className={"px-3 h-8 rounded-md text-[13px] font-medium transition " + (dias === d ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{d}d</button>
            ))}
          </div>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

        {data && data.total === 0 && (
          <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">
            Aún no hay actividad de IA en esta ventana. Cuando el triage clasifique conversaciones o se generen resúmenes/respuestas, aparecerá aquí.
          </CardContent></Card>
        )}

        {data && data.total > 0 && (
          <>
            <div className="flex gap-4 flex-wrap">
              <Metrica etiqueta="Llamadas" valor={num(data.total)} />
              <Metrica etiqueta="Exitosas" valor={num(data.ok)} tono="--exito" />
              <Metrica etiqueta="Fallidas" valor={num(data.fallidos)} tono={data.fallidos > 0 ? "--critico" : undefined} />
              <Metrica etiqueta="Tokens" valor={num(tokens)} />
              <Metrica etiqueta="Latencia" valor={num(data.msPromedio)} sufijo="ms" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Card><CardContent className="pt-5">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Por tarea</div>
                <div className="flex flex-col gap-2">
                  {data.porTarea.map((t) => (
                    <div key={t.tarea} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{t.tarea}</span>
                      <span className="text-muted-foreground tabular-nums">{num(t.llamadas)} · {num(t.tokens)} tok</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Por proveedor / modelo</div>
                <div className="flex flex-col gap-2">
                  {data.porProveedor.map((p) => (
                    <div key={p.proveedor + p.modelo} className="flex items-center justify-between text-sm gap-2">
                      <span className="truncate"><span className="text-[hsl(var(--senal))]">{p.proveedor}</span> <span className="text-muted-foreground">{p.modelo}</span></span>
                      <span className="text-muted-foreground tabular-nums shrink-0">{num(p.llamadas)} · {num(p.tokens)} tok</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            </div>

            <Card><CardContent className="pt-5">
              <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Actividad reciente</div>
              <div className="flex flex-col gap-1.5">
                {data.recientes.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-[13px] rounded-md px-3 py-2 bg-secondary/40">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.ok ? "hsl(var(--exito))" : "hsl(var(--critico))" }} />
                    <span className="capitalize font-medium w-20 shrink-0">{r.tarea}</span>
                    <span className="text-muted-foreground truncate flex-1">{r.proveedor} · {r.modelo}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">{num(r.tokens)} tok</span>
                    <span className="tabular-nums text-muted-foreground shrink-0 w-16 text-right">{num(r.ms)} ms</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </>
        )}
      </div>
    </main>
  );
}
