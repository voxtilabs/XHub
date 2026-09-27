"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOportunidades, crearOportunidad, moverEtapa, cerrarOportunidad, ETAPAS, type Embudo, type Oportunidad } from "@/lib/crm";

const CANALES = ["email", "telefono", "webchat", "instagram", "messenger"];
const clp = (n: number) => "$" + n.toLocaleString("es-CL");

export default function Oportunidades() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="crm.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const [data, setData] = useState<Embudo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ canal: "email", identidad: "", titulo: "", valor: 0, etapa: ETAPAS[0] });
  const [drag, setDrag] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setData(await getOportunidades()); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);

  const ops = (data?.datos ?? []).filter((o) => o.estado === "abierta");
  const puede = data?.puede.gestionar ?? false;

  async function crear() {
    if (f.identidad.trim().length < 3 || f.titulo.trim().length < 2) return;
    try { await crearOportunidad({ canal: f.canal, identidad: f.identidad.trim(), titulo: f.titulo.trim(), valor: Number(f.valor), etapa: f.etapa }); setF({ canal: "email", identidad: "", titulo: "", valor: 0, etapa: ETAPAS[0] }); setNuevo(false); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function mover(id: string, etapa: string) {
    const o = ops.find((x) => x.id === id); if (!o || o.etapa === etapa) return;
    setData((d) => d && { ...d, datos: d.datos.map((x) => x.id === id ? { ...x, etapa } : x) });
    try { await moverEtapa(id, etapa); } catch (e) { setError((e as Error).message); cargar(); }
  }
  async function cerrar(o: Oportunidad, estado: "ganada" | "perdida") {
    try { await cerrarOportunidad(o.id, estado); setToast(`Oportunidad ${estado}`); await cargar(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-7">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
          <div className="text-muted-foreground text-sm mt-0.5">
            {cargando ? "cargando…" : data && <>{data.resumen.abiertas} abiertas · <span className="text-[hsl(var(--senal))]">{clp(data.resumen.valorAbierto)}</span> en el embudo · {data.resumen.ganadas} ganadas ({clp(data.resumen.valorGanado)})</>}
          </div>
        </div>
        {puede && <Button size="sm" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cerrar" : "+ Nueva oportunidad"}</Button>}
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {nuevo && puede && (
        <Card className="mb-5"><CardContent className="pt-5 flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Canal</span>
            <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm capitalize">{CANALES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="flex flex-col flex-1 min-w-[160px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Persona (identidad)</span><Input value={f.identidad} onChange={(e) => setF({ ...f, identidad: e.target.value })} placeholder="juan@empresa.cl" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[160px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Título</span><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Plan anual x50 licencias" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor</span><Input type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} className="mt-1 w-32" /></label>
          <Button onClick={crear}>Crear</Button>
        </CardContent></Card>
      )}

      <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-3 items-start w-max">
          {ETAPAS.map((etapa) => {
            const items = ops.filter((o) => o.etapa === etapa);
            const valor = items.reduce((a, o) => a + o.valor, 0);
            const activo = drag !== null && sobre === etapa;
            return (
              <div key={etapa}
                onDragOver={(e) => { if (drag) { e.preventDefault(); setSobre(etapa); } }}
                onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
                onDrop={(e) => { e.preventDefault(); if (drag) mover(drag, etapa); setSobre(null); }}
                className={"w-[82vw] max-w-[300px] shrink-0 sm:w-[230px] sm:max-w-none flex flex-col rounded-md border min-h-[140px] transition-colors " + (activo ? "border-[hsl(var(--senal)/0.7)] bg-[hsl(var(--senal)/0.08)] " : "border-border bg-card ")}>
                <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border">
                  <span className="font-semibold text-[13px]">{etapa}</span>
                  <span className="ml-auto text-[10.5px] text-muted-foreground tabular-nums">{items.length} · {clp(valor)}</span>
                </div>
                <div className="p-2.5 flex flex-col gap-2 flex-1 min-h-[52px]">
                  {items.map((o) => (
                    <div key={o.id} draggable={puede}
                      onDragStart={() => setDrag(o.id)} onDragEnd={() => { setDrag(null); setSobre(null); }}
                      className={"rounded-[0.55rem] border border-border bg-secondary/50 p-2.5 " + (puede ? "cursor-grab active:cursor-grabbing hover:-translate-y-px hover:shadow-lg transition " : "") + (drag === o.id ? "opacity-40 " : "")}>
                      <Link href={`/oportunidades/${o.id}`} className="block font-medium text-[12.5px] leading-snug hover:text-[hsl(var(--senal))]">{o.titulo}</Link>
                      <div className="text-[11px] text-[hsl(var(--senal))] font-semibold tabular-nums mt-0.5">{clp(o.valor)}</div>
                      {o.persona_email && <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">{o.persona_email}</div>}
                      {puede && (
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => cerrar(o, "ganada")} className="text-[10.5px] rounded-pill px-2 py-0.5 font-semibold" style={{ background: "hsl(var(--exito)/0.15)", color: "hsl(var(--exito))" }}>Ganar</button>
                          <button onClick={() => cerrar(o, "perdida")} className="text-[10.5px] rounded-pill px-2 py-0.5 font-semibold text-muted-foreground hover:text-[hsl(var(--critico))]">Perder</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-[11px] text-muted-foreground/70 font-mono text-center py-2">vacío</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 items-start mt-5 p-3 rounded-md bg-[hsl(var(--senal)/0.08)] border border-border text-[12.5px] text-muted-foreground">
        <span>▸</span>
        <span>Cada oportunidad cuelga de la <b className="text-[hsl(var(--senal))]">misma persona</b> del núcleo: crearla o ganarla queda en su <b className="text-[hsl(var(--senal))]">historia 360</b> y aparece en el contexto de sus tickets. xCRM no tiene su propia base de contactos.</span>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--exito))" }} /><span>{toast}</span></div>}
    </div>
  );
}
