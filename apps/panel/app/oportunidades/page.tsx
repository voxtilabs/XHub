"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { usePrompt } from "@/components/prompt-dialog";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOportunidades, crearOportunidad, moverEtapa, cerrarOportunidad, getOrganizaciones, getPipelines, crearPipeline, agregarEtapa, borrarEtapa, type Embudo, type Etapa, type Oportunidad, type Organizacion, type Pipeline } from "@/lib/crm";
import { HeroFeatures } from "@/components/hero-features";

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
  const { ask, dialog } = usePrompt();
  const [data, setData] = useState<Embudo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ canal: "email", identidad: "", titulo: "", valor: 0, moneda: "CLP", etapaId: "", cierreEsperado: "", orgId: "" });
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipeSel, setPipeSel] = useState<string>("");
  const pipelineInicial = useRef<string | null>(null);
  const solicitudCarga = useRef(0);
  const [config, setConfig] = useState(false);
  const [filtroEtq, setFiltroEtq] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [scrollDisponible, setScrollDisponible] = useState({ anterior: false, siguiente: false });

  const cargar = useCallback(async () => {
    const solicitud = ++solicitudCarga.current;
    setCargando(true); setError(null);
    try {
      const d = await getOportunidades(pipeSel || undefined);
      if (solicitud !== solicitudCarga.current) return;
      setData(d);
      if (!pipeSel) { pipelineInicial.current = d.pipelineId; setPipeSel(d.pipelineId); }
    } catch (e) { if (solicitud === solicitudCarga.current) setError((e as Error).message); }
    finally { if (solicitud === solicitudCarga.current) setCargando(false); }
  }, [pipeSel]);
  useEffect(() => {
    const resuelto = pipelineInicial.current;
    pipelineInicial.current = null;
    // Synchronizing the initial selection does not need to fetch that pipeline again.
    if (pipeSel && pipeSel === resuelto) return;
    cargar();
  }, [cargar, pipeSel]);
  useEffect(() => { getOrganizaciones().then((r) => setOrgs(r.datos)).catch(() => {}); }, []);
  useEffect(() => { getPipelines().then((r) => setPipelines(r.datos)).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);

  const etapas: Etapa[] = data?.etapas ?? [];
  const ops = (data?.datos ?? []).filter((o) => o.estado === "abierta");
  const todasEtq = Array.from(new Set(ops.flatMap((o) => o.etiquetas ?? [])));
  const opsVis = filtroEtq ? ops.filter((o) => (o.etiquetas ?? []).includes(filtroEtq)) : ops;
  const puede = data?.puede.gestionar ?? false;

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const actualizar = () => {
      const anterior = board.scrollLeft > 2;
      const siguiente = board.scrollLeft + board.clientWidth < board.scrollWidth - 2;
      setScrollDisponible((actual) => actual.anterior === anterior && actual.siguiente === siguiente ? actual : { anterior, siguiente });
    };
    const observer = new ResizeObserver(actualizar);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    board.addEventListener("scroll", actualizar, { passive: true });
    actualizar();
    return () => { observer.disconnect(); board.removeEventListener("scroll", actualizar); };
  }, [etapas.length]);

  function desplazarEtapas(direccion: number) {
    const board = boardRef.current;
    if (!board) return;
    const columna = board.querySelector<HTMLElement>(".crm-board-column");
    board.scrollBy({ left: direccion * ((columna?.offsetWidth ?? 280) + 16), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

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
    const n = await ask("Nombre del nuevo pipeline:", "", { title: "Nuevo pipeline", icon: "kanban" }); if (!n?.trim()) return;
    try { const p = await crearPipeline(n.trim()); setPipelines((await getPipelines()).datos); setPipeSel(p.id); } catch (e) { setError((e as Error).message); }
  }
  async function nuevaEtapa() {
    if (!data) return; const n = await ask("Nombre de la etapa:", "", { title: "Nueva etapa", icon: "stack" }); if (!n?.trim()) return;
    const prob = Math.max(0, Math.min(100, Number(await ask("Probabilidad % (0-100):", "50", { title: "Probabilidad de cierre", icon: "chart-line", cancelLabel: "Usar 50%" })) || 50));
    try { await agregarEtapa(data.pipelineId, n.trim(), prob); await cargar(); setPipelines((await getPipelines()).datos); } catch (e) { setError((e as Error).message); }
  }
  async function quitarEtapa(eid: string) { try { await borrarEtapa(eid); await cargar(); } catch (e) { setError((e as Error).message); } }
  async function cerrar(o: Oportunidad, estado: "ganada" | "perdida") {
    let motivo: string | undefined;
    if (estado === "perdida") { motivo = await ask("Motivo de pérdida (opcional):", "", { title: "Cerrar como perdida", description: "Puedes registrar el motivo o continuar sin uno.", icon: "flag", confirmLabel: "Cerrar oportunidad", cancelLabel: "Continuar sin motivo" }) ?? undefined; }
    try { await cerrarOportunidad(o.id, estado, motivo); setToast(`Oportunidad ${estado}`); await cargar(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="xhub-page xhub-crm-page crm-opportunities-page">
      <div className="xhub-page-heading" data-hero="commerce" data-hero-size="long">
        <div>
          <div className="xhub-eyebrow">TU PRÓXIMA GRAN CONVERSACIÓN</div>
          <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
          <p>Cada relación, un paso más cerca.</p>

        <HeroFeatures variant="oportunidades" />
          </div>
        {puede && <Button size="sm" onClick={() => setNuevo((v) => !v)}><Icon name={nuevo ? "x" : "plus"} weight="regular" />{nuevo ? "Cerrar" : "Nueva oportunidad"}</Button>}
      </div>

      <div className="crm-pipeline-summary">
        <div><span className="crm-summary-icon"><Icon name="kanban" weight="duotone" /></span><div><strong>{data?.resumen.abiertas ?? "—"}</strong><span>Oportunidades abiertas</span></div></div>
        <div><span className="crm-summary-icon"><Icon name="chart-line" weight="duotone" /></span><div><strong>{data ? money(data.resumen.valorAbierto, "CLP") : "—"}</strong><span>Valor en el embudo</span></div></div>
        <div><span className="crm-summary-icon"><Icon name="check-circle" weight="duotone" /></span><div><strong>{data?.resumen.ganadas ?? "—"}</strong><span>{data ? `${money(data.resumen.valorGanado, "CLP")} ganados` : "Oportunidades ganadas"}</span></div></div>
      </div>

      <section className="crm-pipeline-workspace" aria-labelledby="crm-pipeline-title">
      <div className="crm-pipeline-toolbar">
        <div className="crm-pipeline-intro"><div className="crm-section-title"><Icon name="kanban" /><h2 id="crm-pipeline-title">Embudo comercial</h2></div><p>{cargando ? "Cargando tu embudo…" : `${opsVis.length} ${opsVis.length === 1 ? "oportunidad" : "oportunidades"} en esta vista · ${etapas.length} etapas`}</p></div>
        <div className="crm-toolbar-actions">
          {pipelines.length > 0 && (
            <select aria-label="Pipeline" value={pipeSel} onChange={(e) => setPipeSel(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-[13px]">
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          {puede && <Button size="sm" variant="secondary" onClick={nuevoPipeline}><Icon name="plus" weight="regular" />Nuevo pipeline</Button>}
          {puede && <Button size="sm" variant="secondary" aria-expanded={config} aria-controls="crm-pipeline-config" onClick={() => setConfig((v) => !v)}><Icon name="sliders-horizontal" weight="regular" />Configurar</Button>}
        </div>
      </div>

      {error && <div role="alert" className="crm-error mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" /> {error}</div>}

      {config && puede && data && (
        <Card id="crm-pipeline-config" className="crm-config-card mb-4"><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Etapas del pipeline</span>
            <Button size="sm" variant="secondary" onClick={nuevaEtapa}><Icon name="plus" weight="regular" />Etapa</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.etapas.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-pill bg-secondary px-2.5 py-1 text-[12px]">{e.nombre} <span className="text-[10px] text-muted-foreground">{e.probabilidad}%</span><button onClick={() => quitarEtapa(e.id)} className="text-muted-foreground hover:text-[hsl(var(--critico))]" aria-label={`borrar ${e.nombre}`}><Icon name="x" /></button></span>
            ))}
          </div>
        </CardContent></Card>
      )}

      {nuevo && puede && (
        <Card className="crm-form-card mb-5"><CardContent className="crm-create-form pt-5">
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

      {todasEtq.length > 0 && (
        <div className="crm-label-filters flex gap-1.5 flex-wrap mb-3 items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">Etiquetas</span>
          {todasEtq.map((e) => (
            <button key={e} aria-pressed={filtroEtq === e} onClick={() => setFiltroEtq(filtroEtq === e ? null : e)} className={"px-2.5 h-7 rounded-pill text-[12px] border " + (filtroEtq === e ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{e}</button>
          ))}
        </div>
      )}
      {cargando && <div className="crm-loading" role="status"><Icon name="spinner-gap" />Cargando oportunidades…</div>}
      <div className="crm-board-navigation">
        <div className="crm-board-guidance"><Icon name="stack" /><span>De la primera conversación al cierre</span>{puede && <span className="crm-board-drag-hint"><Icon name="arrows-out-cardinal" />Arrastra para cambiar de etapa</span>}</div>
        {(scrollDisponible.anterior || scrollDisponible.siguiente) && <div className="crm-board-nav-buttons"><button type="button" aria-label="Ver etapas anteriores" aria-controls="crm-opportunities-board" disabled={!scrollDisponible.anterior} onClick={() => desplazarEtapas(-1)}><Icon name="arrow-left" /></button><button type="button" aria-label="Ver siguientes etapas" aria-controls="crm-opportunities-board" disabled={!scrollDisponible.siguiente} onClick={() => desplazarEtapas(1)}><Icon name="arrow-right" /></button></div>}
      </div>
      <div ref={boardRef} id="crm-opportunities-board" className="crm-board-scroll" role="region" aria-label="Etapas del embudo" tabIndex={0}>
        <div className="crm-board">
          {etapas.map((etapa, indice) => {
            const items = opsVis.filter((o) => o.etapa_id === etapa.id);
            const valores = Array.from(items.reduce((totales, o) => totales.set(o.moneda, (totales.get(o.moneda) ?? 0) + o.valor), new Map<string, number>()));
            const activo = drag !== null && sobre === etapa.id;
            return (
              <div key={etapa.id} role="group" data-drop-active={activo} data-populated={items.length > 0} aria-label={etapa.nombre}
                onDragOver={(e) => { if (drag) { e.preventDefault(); setSobre(etapa.id); } }}
                onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                onDrop={(e) => { e.preventDefault(); if (drag) mover(drag, etapa.id); setSobre(null); }}
                className="crm-board-column">
                <header className="crm-board-column-heading">
                  <div className="crm-lane-title"><h3>{etapa.nombre}</h3><span aria-label={`Etapa ${indice + 1}`}>{String(indice + 1).padStart(2, "0")}</span></div>
                  <div className="crm-lane-summary"><div className="crm-lane-count"><strong>{items.length}</strong><span>{items.length === 1 ? "oportunidad" : "oportunidades"}</span></div><div className="crm-lane-value"><span>Valor en etapa</span>{valores.length ? valores.map(([moneda, valor]) => <strong key={moneda}>{money(valor, moneda)}</strong>) : <strong>$0</strong>}</div></div>
                  <div className="crm-lane-probability"><div><span>Probabilidad de la etapa</span><strong>{etapa.probabilidad}%</strong></div><div className="crm-lane-probability-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, etapa.probabilidad))}%` }} /></div></div>
                </header>
                <div className="crm-lane-body">
                  {items.map((o) => (
                    <div key={o.id} draggable={puede}
                      onDragStart={() => setDrag(o.id)} onDragEnd={() => { setDrag(null); setSobre(null); }}
                      className={"crm-deal-card " + (drag === o.id ? "opacity-40" : "")}>
                      <div className="crm-deal-eyebrow"><span>Oportunidad</span>{puede && <Icon name="arrows-out-cardinal" />}</div>
                      <Link href={`/oportunidades/${o.id}`} draggable={false} className="crm-deal-title"><span>{o.titulo}</span><Icon name="arrow-up-right" /></Link>
                      <div className="crm-deal-value"><span>Valor del negocio</span><strong>{money(o.valor, o.moneda)}</strong></div>
                      {(o.org_nombre || o.persona_email || o.cierre_esperado) && <div className="crm-deal-details">
                        {o.org_nombre && <div><Icon name="building-office" /><span>{o.org_nombre}</span></div>}
                        {o.persona_email && <div><Icon name="user" /><span>{o.persona_email}</span></div>}
                        {o.cierre_esperado && <div><Icon name="clock" /><span>Cierre esperado: {o.cierre_esperado}</span></div>}
                      </div>}
                      {(o.etiquetas ?? []).length > 0 && <div className="crm-deal-labels">{(o.etiquetas ?? []).map((e) => <span key={e}>{e}</span>)}</div>}
                      {puede && (
                        <div className="crm-deal-actions">
                          <button className="crm-deal-win" onClick={() => cerrar(o, "ganada")}><Icon name="check-circle" />Ganar</button>
                          <button className="crm-deal-lose" onClick={() => cerrar(o, "perdida")}><Icon name="flag" />Perder</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && <div className="crm-board-empty"><div className="crm-lane-empty-art" aria-hidden="true"><span className="crm-lane-empty-sheet" /><span className="crm-lane-empty-front"><Icon name="chart-line" /><i /><i /></span></div><strong>{filtroEtq ? "Sin coincidencias" : "Sin oportunidades"}</strong><p>{filtroEtq ? "No hay oportunidades con esta etiqueta en la etapa." : "Las oportunidades de esta etapa aparecerán aquí."}</p></div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="crm-pipeline-footnote">
        <Icon name="info" weight="regular" />
        <span>Cada oportunidad mantiene sus actividades y tickets conectados a la misma ficha de persona.</span>
      </div>
      </section>

      {dialog}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--exito))" }} /><span>{toast}</span></div>}
    </div>
  );
}
