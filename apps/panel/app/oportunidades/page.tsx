"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOportunidades, crearOportunidad, moverEtapa, cerrarOportunidad, getOrganizaciones, getPipelines, crearPipeline, agregarEtapa, borrarEtapa, type Embudo, type Etapa, type Oportunidad, type Organizacion, type Pipeline } from "@/lib/crm";

const CANALES = ["email", "telefono", "webchat", "instagram", "messenger"];
const MONEDAS = ["CLP", "UF", "USD"];
const money = (n: number, m: string) => (m === "CLP" ? "$" : m + " ") + n.toLocaleString("es-CL");

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
  const [f, setF] = useState({ canal: "email", identidad: "", titulo: "", valor: 0, moneda: "CLP", etapaId: "", cierreEsperado: "", orgId: "" });
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipeSel, setPipeSel] = useState<string>("");
  const [config, setConfig] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { const d = await getOportunidades(pipeSel || undefined); setData(d); if (!pipeSel) setPipeSel(d.pipelineId); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [pipeSel]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { getOrganizaciones().then((r) => setOrgs(r.datos)).catch(() => {}); }, []);
  useEffect(() => { getPipelines().then((r) => setPipelines(r.datos)).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);

  const etapas: Etapa[] = data?.etapas ?? [];
  const ops = (data?.datos ?? []).filter((o) => o.estado === "abierta");
  const puede = data?.puede.gestionar ?? false;

  async function crear() {
    if (f.identidad.trim().length < 3 || f.titulo.trim().length < 2) return;
    try {
      await crearOportunidad({ canal: f.canal, identidad: f.identidad.trim(), titulo: f.titulo.trim(), valor: Number(f.valor), moneda: f.moneda, etapaId: f.etapaId || etapas[0]?.id, cierreEsperado: f.cierreEsperado || undefined, orgId: f.orgId || undefined });
      setF({ canal: "email", identidad: "", titulo: "", valor: 0, moneda: "CLP", etapaId: "", cierreEsperado: "", orgId: "" }); setNuevo(false); await cargar();
    } catch (e) { setError((e as Error).message); }
  }
  async function mover(id: string, etapaId: string) {
    const o = ops.find((x) => x.id === id); if (!o || o.etapa_id === etapaId) return;
    setData((d) => d && { ...d, datos: d.datos.map((x) => x.id === id ? { ...x, etapa_id: etapaId } : x) });
    try { await moverEtapa(id, etapaId); } catch (e) { setError((e as Error).message); cargar(); }
  }
  async function nuevoPipeline() {
    const n = window.prompt("Nombre del nuevo pipeline:"); if (!n?.trim()) return;
    try { const p = await crearPipeline(n.trim()); setPipelines((await getPipelines()).datos); setPipeSel(p.id); } catch (e) { setError((e as Error).message); }
  }
  async function nuevaEtapa() {
    if (!data) return; const n = window.prompt("Nombre de la etapa:"); if (!n?.trim()) return;
    const prob = Math.max(0, Math.min(100, Number(window.prompt("Probabilidad % (0-100):", "50")) || 50));
    try { await agregarEtapa(data.pipelineId, n.trim(), prob); await cargar(); setPipelines((await getPipelines()).datos); } catch (e) { setError((e as Error).message); }
  }
  async function quitarEtapa(eid: string) { try { await borrarEtapa(eid); await cargar(); } catch (e) { setError((e as Error).message); } }
  async function cerrar(o: Oportunidad, estado: "ganada" | "perdida") {
    let motivo: string | undefined;
    if (estado === "perdida") { motivo = window.prompt("Motivo de pérdida (opcional):") ?? undefined; }
    try { await cerrarOportunidad(o.id, estado, motivo); setToast(`Oportunidad ${estado}`); await cargar(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-7">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
          <div className="text-muted-foreground text-sm mt-0.5">
            {cargando ? "cargando…" : data && <>{data.resumen.abiertas} abiertas · <span className="text-[hsl(var(--senal))]">{money(data.resumen.valorAbierto, "CLP")}</span> en el embudo · {data.resumen.ganadas} ganadas ({money(data.resumen.valorGanado, "CLP")})</>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pipelines.length > 0 && (
            <select value={pipeSel} onChange={(e) => setPipeSel(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-[13px]">
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          {puede && <Button size="sm" variant="secondary" onClick={nuevoPipeline}>+ Pipeline</Button>}
          {puede && <Button size="sm" variant="secondary" onClick={() => setConfig((v) => !v)}>Configurar</Button>}
          {puede && <Button size="sm" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cerrar" : "+ Nueva oportunidad"}</Button>}
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {config && puede && data && (
        <Card className="mb-4"><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Etapas del pipeline</span>
            <Button size="sm" variant="secondary" onClick={nuevaEtapa}>+ Etapa</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.etapas.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-pill bg-secondary px-2.5 py-1 text-[12px]">{e.nombre} <span className="text-[10px] text-muted-foreground">{e.probabilidad}%</span><button onClick={() => quitarEtapa(e.id)} className="text-muted-foreground hover:text-[hsl(var(--critico))]" aria-label={`borrar ${e.nombre}`}>×</button></span>
            ))}
          </div>
        </CardContent></Card>
      )}

      {nuevo && puede && (
        <Card className="mb-5"><CardContent className="pt-5 flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Canal</span>
            <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm capitalize">{CANALES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="flex flex-col flex-1 min-w-[150px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Persona (identidad)</span><Input value={f.identidad} onChange={(e) => setF({ ...f, identidad: e.target.value })} placeholder="juan@empresa.cl" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[150px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Título</span><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Depto 2D2B Ñuñoa" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor</span><Input type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} className="mt-1 w-28" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Moneda</span>
            <select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm">{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Etapa</span>
            <select value={f.etapaId} onChange={(e) => setF({ ...f, etapaId: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm">{etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cierre esperado</span><Input type="date" value={f.cierreEsperado} onChange={(e) => setF({ ...f, cierreEsperado: e.target.value })} className="mt-1 w-40" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Empresa</span>
            <select value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm max-w-[160px]"><option value="">—</option>{orgs.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select></label>
          <Button onClick={crear}>Crear</Button>
        </CardContent></Card>
      )}

      <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-3 items-start w-max">
          {etapas.map((etapa) => {
            const items = ops.filter((o) => o.etapa_id === etapa.id);
            const valor = items.reduce((a, o) => a + o.valor, 0);
            const activo = drag !== null && sobre === etapa.id;
            return (
              <div key={etapa.id}
                onDragOver={(e) => { if (drag) { e.preventDefault(); setSobre(etapa.id); } }}
                onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                onDrop={(e) => { e.preventDefault(); if (drag) mover(drag, etapa.id); setSobre(null); }}
                className={"w-[82vw] max-w-[300px] shrink-0 sm:w-[230px] sm:max-w-none flex flex-col rounded-md border min-h-[140px] transition-colors " + (activo ? "border-[hsl(var(--senal)/0.7)] bg-[hsl(var(--senal)/0.08)] " : "border-border bg-card ")}>
                <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border">
                  <span className="font-semibold text-[13px]">{etapa.nombre}</span>
                  <span className="text-[9px] text-muted-foreground rounded-pill bg-secondary px-1.5">{etapa.probabilidad}%</span>
                  <span className="ml-auto text-[10.5px] text-muted-foreground tabular-nums">{items.length} · {money(valor, "CLP")}</span>
                </div>
                <div className="p-2.5 flex flex-col gap-2 flex-1 min-h-[52px]">
                  {items.map((o) => (
                    <div key={o.id} draggable={puede}
                      onDragStart={() => setDrag(o.id)} onDragEnd={() => { setDrag(null); setSobre(null); }}
                      className={"rounded-[0.55rem] border border-border bg-secondary/50 p-2.5 " + (puede ? "cursor-grab active:cursor-grabbing hover:-translate-y-px hover:shadow-lg transition " : "") + (drag === o.id ? "opacity-40 " : "")}>
                      <Link href={`/oportunidades/${o.id}`} className="block font-medium text-[12.5px] leading-snug hover:text-[hsl(var(--senal))]">{o.titulo}</Link>
                      <div className="text-[11px] text-[hsl(var(--senal))] font-semibold tabular-nums mt-0.5">{money(o.valor, o.moneda)}</div>
                      {o.org_nombre && <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">🏢 {o.org_nombre}</div>}
                      {o.persona_email && <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">{o.persona_email}</div>}
                      {o.cierre_esperado && <div className="text-[10px] text-muted-foreground mt-0.5">cierre {o.cierre_esperado}</div>}
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
        <span>Embudo estilo <b className="text-[hsl(var(--senal))]">Pipedrive</b>: etapas configurables con probabilidad, deals con moneda y cierre esperado. Cada oportunidad cuelga de la misma persona del núcleo — aparece en su ficha 360 y en sus tickets.</span>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--exito))" }} /><span>{toast}</span></div>}
    </div>
  );
}
