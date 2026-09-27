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
  TRANS, type Detalle, type Mensaje, type Contexto, type Estado, type Prioridad,
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

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [d, m, c] = await Promise.all([getTicket(id), getMensajes(id), getContexto(id)]);
      setT(d); setMsgs(m.datos); setCtx(c);
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);
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
            {t.canal_origen ?? "sin canal"}{t.categoria ? ` · ${t.categoria}` : ""} · creado {fecha(t.creado_en)}
            {(t.etiquetas ?? []).map((e) => <span key={e} className="ml-1.5 rounded-pill bg-secondary px-1.5 py-0.5 text-[10.5px]">{e}</span>)}
          </div>
        </div>
        {puede && (
          <div className="flex gap-1.5 flex-wrap">
            {TRANS[t.estado].map((e) => (
              <Button key={e} size="sm" variant="secondary" onClick={() => transicionar(e)} className="capitalize">{e}</Button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

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
              <div className="inline-flex gap-0.5 bg-secondary/60 p-0.5 rounded-md border border-border mb-2">
                {[["pública", false], ["nota interna", true]].map(([lbl, val]) => (
                  <button key={String(val)} onClick={() => setInterno(val as boolean)} aria-pressed={interno === val}
                    className={"px-3 h-8 rounded-[0.4rem] text-[13px] font-medium capitalize " + (interno === val ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {lbl as string}
                  </button>
                ))}
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
