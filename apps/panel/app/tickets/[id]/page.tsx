"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import {
  getTicket, getMensajes, getContexto, getSugerencia, responder, notaInterna, cambiarEstado,
  getAgentes, asignar, cambiarPrioridad, getMacros, guardarEtiquetas, getCategorias, cambiarCategoria, calificarCsat, TRANS, type Detalle, type Mensaje, type Contexto, type Estado, type Prioridad, type Agente, type Macro, type Categoria,
} from "@/lib/tickets";

type Rol = "exito" | "aviso" | "critico" | "senal" | "neutro";
const priT: Record<Prioridad, Rol> = { baja: "senal", media: "senal", alta: "aviso", urgente: "critico" };
const estT: Record<Estado, Rol> = { nuevo: "senal", abierto: "aviso", pendiente: "neutro", resuelto: "exito", cerrado: "neutro" };
const fecha = (s: string | null) => s ? new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function DetalleTicket() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="bandeja.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [t, setT] = useState<Detalle | null>(null);
  const [msgs, setMsgs] = useState<Mensaje[]>([]);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [verMacros, setVerMacros] = useState(false);
  const [nuevaEtq, setNuevaEtq] = useState("");
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [d, m, c] = await Promise.all([getTicket(id), getMensajes(id), getContexto(id)]);
      setT(d); setMsgs(m.datos); setCtx(c);
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { getAgentes().then((r) => setAgentes(r.datos)).catch(() => {}); }, []);
  useEffect(() => { getMacros().then((r) => setMacros(r.datos)).catch(() => {}); }, []);
  useEffect(() => { getCategorias().then((r) => setCategorias(r.datos)).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), 2600); return () => clearTimeout(x); }, [toast]);

  const puede = t?.puede.gestionar ?? false;

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true); setError(null);
    try {
      if (interno) await notaInterna(id, texto.trim()); else await responder(id, texto.trim());
      setTexto("");
      const m = await getMensajes(id); setMsgs(m.datos);
      const d = await getTicket(id); setT(d);
      setToast(interno ? "Nota interna agregada" : "Respuesta enviada");
    } catch (e) { setError((e as Error).message); } finally { setEnviando(false); }
  }
  async function sugerir() {
    setSugiriendo(true); setError(null);
    try { const s = await getSugerencia(id); if (s.sugerencia) { setTexto(s.sugerencia); setInterno(false); } else setToast("La IA no devolvió sugerencia (¿apagada?)"); }
    catch (e) { setError((e as Error).message); } finally { setSugiriendo(false); }
  }
  async function transicionar(e: Estado) {
    setError(null);
    try { await cambiarEstado(id, e); setT((prev) => prev && { ...prev, estado: e }); const m = await getMensajes(id); setMsgs(m.datos); setToast(`Estado → ${e}`); }
    catch (err) { setError((err as Error).message); }
  }
  async function asignarA(u: string) {
    setError(null);
    try { await asignar(id, u || null); setT((prev) => prev && { ...prev, asignado_usuario: u || null }); setToast(u ? "Ticket asignado" : "Ticket sin asignar"); }
    catch (err) { setError((err as Error).message); }
  }
  async function ponerPrioridad(p: Prioridad) {
    setError(null);
    try { await cambiarPrioridad(id, p); setT((prev) => prev && { ...prev, prioridad: p }); setToast(`Prioridad → ${p}`); }
    catch (err) { setError((err as Error).message); }
  }
  async function fijarEtiquetas(lista: string[]) {
    setError(null);
    try { const r = await guardarEtiquetas(id, lista); setT((prev) => prev && { ...prev, etiquetas: r.etiquetas }); }
    catch (err) { setError((err as Error).message); }
  }
  async function fijarCategoria(cat: string) {
    setError(null);
    try { await cambiarCategoria(id, cat || null); setT((prev) => prev && { ...prev, categoria: cat || null }); }
    catch (err) { setError((err as Error).message); }
  }
  async function calificar(n: number) {
    setError(null);
    try { await calificarCsat(id, n); setT((prev) => prev && { ...prev, satisfaccion: n }); setToast(`CSAT: ${n}★`); }
    catch (err) { setError((err as Error).message); }
  }

  if (cargando) return <div className="max-w-5xl mx-auto p-10 text-sm text-muted-foreground font-mono">Cargando ticket…</div>;
  if (!t) return <div className="max-w-5xl mx-auto p-8"><div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error ?? "No se pudo cargar el ticket"}</div><Link href="/tickets" className="text-[hsl(var(--senal))] text-sm underline mt-3 inline-block">← Volver a la bandeja</Link></div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-7">
      <Link href="/tickets" className="text-[13px] text-muted-foreground hover:text-foreground">← Bandeja</Link>
      <div className="flex items-start justify-between gap-3 mt-2 mb-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">#{t.numero}</span>
            <Badge rol={estT[t.estado]}>{t.estado}</Badge>
            <Badge rol={priT[t.prioridad]}>{t.prioridad}</Badge>
            {t.urgencia_detectada === "alta" && <Badge rol="critico">urgencia alta</Badge>}
            {t.sla_incumplido && <Badge rol="critico">SLA vencido</Badge>}
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1.5">{t.asunto}</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            {t.canal_origen ?? "sin canal"}{t.categoria ? ` · ${t.categoria}` : ""} · creado {fecha(t.creado_en)} · {t.asignado_usuario ? (agentes.find((a) => a.id === t.asignado_usuario)?.nombre || agentes.find((a) => a.id === t.asignado_usuario)?.email || "asignado") : "sin asignar"}
            {(t.etiquetas ?? []).map((e) => <span key={e} className="ml-1.5 rounded-pill bg-secondary px-1.5 py-0.5 text-[10.5px]">{e}</span>)}
          </div>
        </div>
        {puede && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <select value={t.asignado_usuario ?? ""} onChange={(e) => asignarA(e.target.value)} title="Asignar a"
              className="h-9 rounded-md border border-border bg-background px-2 text-[13px] max-w-[160px]">
              <option value="">Sin asignar</option>
              {agentes.map((a) => <option key={a.id} value={a.id}>{a.nombre || a.email}</option>)}
            </select>
            <select value={t.prioridad} onChange={(e) => ponerPrioridad(e.target.value as Prioridad)} title="Prioridad"
              className="h-9 rounded-md border border-border bg-background px-2 text-[13px] capitalize">
              {(["baja", "media", "alta", "urgente"] as Prioridad[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="w-px h-6 bg-border mx-0.5" />
            {TRANS[t.estado].map((e) => (
              <Button key={e} size="sm" variant="secondary" onClick={() => transicionar(e)} className="capitalize">{e}</Button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {puede && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mr-1">Categoría</span>
          <select value={t.categoria ?? ""} onChange={(e) => fijarCategoria(e.target.value)} className="h-7 rounded-md border border-border bg-background px-2 text-[12px] max-w-[160px]">
            <option value="">— sin categoría —</option>
            {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            {t.categoria && !categorias.some((c) => c.nombre === t.categoria) && <option value={t.categoria}>{t.categoria}</option>}
          </select>
          <span className="w-px h-6 bg-border mx-1" />
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mr-1">Etiquetas</span>
          {(t.etiquetas ?? []).map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-pill bg-secondary px-2 py-0.5 text-[11.5px]">
              {e}<button onClick={() => fijarEtiquetas((t.etiquetas ?? []).filter((x) => x !== e))} className="text-muted-foreground hover:text-[hsl(var(--critico))]" aria-label={`quitar ${e}`}>×</button>
            </span>
          ))}
          <input value={nuevaEtq} onChange={(e) => setNuevaEtq(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nuevaEtq.trim()) { fijarEtiquetas([...(t.etiquetas ?? []), nuevaEtq.trim()]); setNuevaEtq(""); } }}
            placeholder="+ etiqueta y Enter" className="h-7 w-36 rounded-pill border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        {/* Conversación */}
        <div className="flex flex-col gap-3">
          <Card><CardContent className="pt-5 space-y-3">
            {msgs.length === 0 && <div className="text-[13px] text-muted-foreground">Sin mensajes todavía.</div>}
            {msgs.map((m) => {
              if (m.interno) return (
                <div key={m.seq} className="rounded-md border p-3" style={{ background: "hsl(var(--aviso)/0.08)", borderColor: "hsl(var(--aviso)/0.35)" }}>
                  <div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "hsl(var(--aviso))" }}>Nota interna</span><span className="text-[10.5px] text-muted-foreground ml-auto">{fecha(m.creado_en)}</span></div>
                  <div className="text-[13.5px] whitespace-pre-wrap">{m.cuerpo}</div>
                </div>
              );
              const dePersona = m.autor_tipo === "persona";
              return (
                <div key={m.seq} className={"flex " + (dePersona ? "justify-start" : "justify-end")}>
                  <div className={"max-w-[85%] rounded-lg p-3 " + (dePersona ? "bg-secondary/60 border border-border" : "bg-[hsl(var(--senal)/0.1)] border border-[hsl(var(--senal)/0.3)]")}>
                    <div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{dePersona ? "Cliente" : m.autor_tipo === "sistema" ? "Sistema" : "Agente"}</span><span className="text-[10.5px] text-muted-foreground ml-auto">{fecha(m.creado_en)}</span></div>
                    <div className="text-[13.5px] whitespace-pre-wrap">{m.cuerpo}</div>
                  </div>
                </div>
              );
            })}
          </CardContent></Card>

          {/* Composer */}
          {puede ? (
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="inline-flex gap-0.5 bg-secondary/60 p-0.5 rounded-md border border-border">
                  {[["pública", false], ["nota interna", true]].map(([lbl, val]) => (
                    <button key={String(val)} onClick={() => setInterno(val as boolean)} aria-pressed={interno === val}
                      className={"px-3 h-8 rounded-[0.4rem] text-[13px] font-medium capitalize " + (interno === val ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {lbl as string}
                    </button>
                  ))}
                </div>
                {macros.length > 0 && (
                  <div className="relative">
                    <button onClick={() => setVerMacros((v) => !v)} className="h-8 px-3 rounded-md border border-border bg-secondary/60 text-[13px] font-medium hover:text-foreground text-muted-foreground">Macros ▾</button>
                    {verMacros && (
                      <div className="absolute z-20 mt-1 w-72 max-h-64 overflow-auto rounded-md border border-border bg-card shadow-2xl p-1">
                        {macros.map((mc) => (
                          <button key={mc.id} onClick={() => { setTexto(mc.cuerpo); setVerMacros(false); }}
                            className="block w-full text-left rounded-md px-2.5 py-1.5 hover:bg-secondary">
                            <span className="block text-[13px] font-medium">{mc.titulo}</span>
                            <span className="block text-[11px] text-muted-foreground truncate">{mc.cuerpo}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
                placeholder={interno ? "Nota privada para el equipo (la persona no la ve)…" : "Escribe tu respuesta al cliente…"}
                className="w-full rounded-md border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}>{enviando ? "Enviando…" : interno ? "Guardar nota" : "Enviar respuesta"}</Button>
                {!interno && <Button size="sm" variant="secondary" onClick={sugerir} disabled={sugiriendo}>{sugiriendo ? "Pensando…" : "✦ Sugerir con IA"}</Button>}
                <span className="text-[11px] text-muted-foreground ml-auto">{interno ? "Solo el equipo la verá." : "La primera respuesta marca el SLA."}</span>
              </div>
            </CardContent></Card>
          ) : (
            <div className="text-[12.5px] text-muted-foreground p-3 rounded-md bg-secondary/40 border border-border">Tienes acceso de lectura. Para responder o cambiar estado necesitas el permiso <code className="text-[11px] px-1 rounded bg-secondary">bandeja.gestionar</code>.</div>
          )}
        </div>

        {/* Contexto 360 */}
        <div className="flex flex-col gap-3">
          <Card><CardContent className="pt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Reincidencia</div>
            {ctx ? (
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Tickets totales</span><span className="tabular-nums font-medium">{ctx.reincidencia.totalTickets}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Últimos 30 días</span><span className="tabular-nums font-medium">{ctx.reincidencia.ultimos30}</span></div>
                {ctx.reincidencia.esRecurrente && <Badge rol="aviso">Cliente recurrente</Badge>}
              </div>
            ) : <div className="text-[12.5px] text-muted-foreground">—</div>}
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Satisfacción (CSAT)</div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} disabled={!puede} onClick={() => calificar(n)} aria-label={`${n} estrellas`}
                  className={"text-xl leading-none " + ((t.satisfaccion ?? 0) >= n ? "text-[hsl(var(--aviso))]" : "text-muted-foreground/40") + (puede ? " hover:text-[hsl(var(--aviso))]" : "")}>★</button>
              ))}
              <span className="text-[11px] text-muted-foreground ml-2">{t.satisfaccion ? `${t.satisfaccion}/5` : (t.estado === "resuelto" || t.estado === "cerrado" ? "sin calificar" : "al resolver")}</span>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Historia omnicanal</div>
            <div className="space-y-0">
              {ctx && ctx.omnicanal.length > 0 ? ctx.omnicanal.map((o, i) => (
                <div key={i} className="flex gap-2 py-2 border-t border-border first:border-t-0">
                  <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "hsl(var(--senal))" }} />
                  <div className="min-w-0">
                    <div className="text-[12.5px]">{o.resumen ?? o.tipo}</div>
                    <div className="text-[10.5px] text-muted-foreground">{o.modulo} · {fecha(o.ocurrioEn)}</div>
                  </div>
                </div>
              )) : <div className="text-[12.5px] text-muted-foreground">Sin interacciones previas registradas.</div>}
            </div>
          </CardContent></Card>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl">
          <span className="h-2 w-2 rounded-full flex-none" style={{ background: "hsl(var(--exito))" }} /><span>{toast}</span>
        </div>
      )}
    </div>
  );
}
