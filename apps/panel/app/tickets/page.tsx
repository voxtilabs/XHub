"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { useYo } from "@/lib/permisos";
import { getBandeja, cambiarEstado, getAgentes, TRANS, ESTADOS, type Bandeja, type TicketRow, type Estado, type Prioridad } from "@/lib/tickets";

type Rol = "exito" | "aviso" | "critico" | "senal" | "neutro";
const priT: Record<Prioridad, Rol> = { baja: "senal", media: "senal", alta: "aviso", urgente: "critico" };
const estT: Record<Estado, Rol> = { nuevo: "senal", abierto: "aviso", pendiente: "neutro", resuelto: "exito", cerrado: "neutro" };
const estDot: Record<Estado, string> = { nuevo: "--senal", abierto: "--aviso", pendiente: "--muted-foreground", resuelto: "--exito", cerrado: "--muted-foreground" };
const FILTROS: (Estado | "todos")[] = ["todos", "nuevo", "abierto", "pendiente", "resuelto", "cerrado"];

export default function Bandeja() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="bandeja.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const router = useRouter();
  const [data, setData] = useState<Bandeja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<"lista" | "tablero">("lista");
  const [filtro, setFiltro] = useState<Estado | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [dragFrom, setDragFrom] = useState<Estado | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Estado | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [agentes, setAgentes] = useState<Record<string, string>>({});
  const [vistaRapida, setVistaRapida] = useState<"todos" | "mios" | "sin">("todos");
  const { yo } = useYo();

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setData(await getBandeja()); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { getAgentes().then((r) => setAgentes(Object.fromEntries(r.datos.map((a) => [a.id, a.nombre || a.email])))).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  const tickets = data?.datos ?? [];
  const puedeGestionar = data?.puede.gestionar ?? false;
  const match = (t: TicketRow) => { const q = busca.trim().toLowerCase(); return !q || `#${t.numero} ${t.asunto} ${t.resumen ?? ""}`.toLowerCase().includes(q); };
  const cnt = (f: Estado | "todos") => f === "todos" ? tickets.filter(match).length : (data?.porEstado[f] ?? 0);
  const nombreAgente = (t: TicketRow) => t.asignado_usuario ? (agentes[t.asignado_usuario] ?? "Asignado") : null;
  const pasaRapida = (t: TicketRow) => vistaRapida === "todos" || (vistaRapida === "mios" ? t.asignado_usuario === yo?.id : !t.asignado_usuario);
  const rows = tickets.filter((t) => (filtro === "todos" || t.estado === filtro) && pasaRapida(t) && match(t));

  async function mover(id: string, hacia: Estado) {
    const t = tickets.find((x) => x.id === id);
    if (!t || t.estado === hacia) return;
    if (!TRANS[t.estado].includes(hacia)) { setToast({ ok: false, msg: `Transición inválida: ${t.estado} → ${hacia}` }); return; }
    setData((d) => d && { ...d, datos: d.datos.map((x) => x.id === id ? { ...x, estado: hacia } : x) });
    try { await cambiarEstado(id, hacia); setToast({ ok: true, msg: `Ticket #${t.numero}: ${t.estado} → ${hacia}` }); }
    catch (e) { setToast({ ok: false, msg: (e as Error).message }); cargar(); }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-7">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bandeja</h1>
          <div className="text-muted-foreground text-sm mt-0.5">
            {cargando ? "cargando…" : <>{tickets.length} tickets · {data?.sinAsignar ?? 0} sin asignar · {(data?.vencidos ?? 0) > 0 ? <span className="text-[hsl(var(--critico))]">{data?.vencidos} con SLA vencido</span> : "SLA al día"}</>}
          </div>
        </div>
        {puedeGestionar && <Button size="sm" asChild><Link href="/tickets/nuevo">+ Nuevo ticket</Link></Button>}
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:flex-1 sm:max-w-[340px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por asunto o #…" className="h-9 pl-9 rounded-pill w-full" aria-label="Buscar tickets" />
        </div>
        <div className="inline-flex gap-0.5 bg-secondary/60 p-0.5 rounded-md border border-border self-start sm:self-auto sm:ml-auto">
          {(["lista", "tablero"] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
              className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-[0.4rem] text-[13px] font-medium capitalize " + (vista === v ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v === "lista" ? "Lista" : "Tablero"}
            </button>
          ))}
        </div>
      </div>

      {vista === "lista" ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            {([["mios", "Míos"], ["sin", "Sin asignar"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVistaRapida(vistaRapida === v ? "todos" : v)}
                className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-[13px] font-medium border " + (vistaRapida === v ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
            <span className="w-px h-6 bg-border mx-1" />
            {FILTROS.map((x) => (
              <button key={x} onClick={() => setFiltro(x)}
                className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-[13px] font-medium border capitalize " + (filtro === x ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {x === "todos" ? "Todos" : x}
                <span className="tabular-nums text-[10px] rounded-pill px-1.5 py-px" style={{ background: filtro === x ? "hsl(var(--senal)/0.2)" : "hsl(var(--secondary))" }}>{cnt(x)}</span>
              </button>
            ))}
          </div>
          {/* Móvil: lista de tarjetas (la tabla de 7 columnas es ilegible en 390px) */}
          <div className="sm:hidden flex flex-col gap-2">
            {rows.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="block rounded-lg border border-border bg-card p-3 active:bg-secondary/50">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="font-mono text-[11px] text-muted-foreground">#{t.numero}</span>
                  <Badge rol={priT[t.prioridad]} className="text-[9.5px] px-1.5 py-0">{t.prioridad}</Badge>
                  <Badge rol={estT[t.estado]} className="text-[9.5px] px-1.5 py-0">{t.estado}</Badge>
                  {t.sla_incumplido && <Badge rol="critico" className="text-[9.5px] px-1.5 py-0">SLA vencido</Badge>}
                </div>
                <div className="font-medium text-[14px] leading-snug">{t.asunto}</div>
                <div className="text-[11.5px] text-muted-foreground mt-1 truncate">{nombreAgente(t) ?? "Sin asignar"} · {t.canal_origen ?? "—"}</div>
              </Link>
            ))}
            {!cargando && rows.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No hay tickets{busca ? " que coincidan" : " todavía"}.</div>}
            {cargando && <div className="p-8 text-center text-muted-foreground text-xs font-mono">Cargando…</div>}
          </div>

          {/* Desktop: tabla */}
          <Card className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="p-3 font-black">#</th><th className="p-3 font-black">Asunto</th><th className="p-3 font-black">Prioridad</th><th className="p-3 font-black">Estado</th><th className="p-3 font-black">Agente</th><th className="p-3 font-black">Canal</th><th className="p-3 font-black">SLA</th>
                </tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer">
                      <td className="p-3 tabular-nums text-muted-foreground"><Link href={`/tickets/${t.id}`} className="block">#{t.numero}</Link></td>
                      <td className="p-3"><Link href={`/tickets/${t.id}`} className="block"><div className="font-medium">{t.asunto}</div>{t.resumen && <div className="text-xs text-muted-foreground truncate max-w-[380px]">{t.resumen}</div>}</Link></td>
                      <td className="p-3"><Badge rol={priT[t.prioridad]}>{t.prioridad}</Badge></td>
                      <td className="p-3"><Badge rol={estT[t.estado]}>{t.estado}</Badge></td>
                      <td className="p-3 text-[13px]">{nombreAgente(t) ?? <span className="text-[hsl(var(--critico))] text-xs font-semibold">Sin asignar</span>}</td>
                      <td className="p-3 text-muted-foreground">{t.canal_origen ?? "—"}</td>
                      <td className="p-3">{t.sla_incumplido ? <Badge rol="critico">vencido</Badge> : <span className="text-muted-foreground text-xs">en plazo</span>}</td>
                    </tr>
                  ))}
                  {!cargando && rows.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground text-sm">No hay tickets{busca ? " que coincidan" : " todavía"}. {puedeGestionar && !busca && <Link href="/tickets/nuevo" className="text-[hsl(var(--senal))] underline">Crea el primero</Link>}</td></tr>}
                  {cargando && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground text-xs font-mono">Cargando…</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-3 items-start w-max">
            {ESTADOS.map((est) => {
              const items = tickets.filter((t) => t.estado === est && match(t));
              const arrastrando = dragFrom !== null;
              const valido = arrastrando && dragFrom !== est && TRANS[dragFrom].includes(est);
              const invalido = arrastrando && dragFrom !== est && !TRANS[dragFrom].includes(est);
              return (
                <div key={est}
                  onDragOver={(e) => { if (valido) { e.preventDefault(); setSobre(est); } }}
                  onDragLeave={() => setSobre((s) => (s === est ? null : s))}
                  onDrop={(e) => { e.preventDefault(); if (dragId != null) mover(dragId, est); setSobre(null); }}
                  className={"w-[80vw] max-w-[300px] shrink-0 sm:w-[220px] sm:max-w-none flex flex-col rounded-md border min-h-[130px] transition-colors " + (invalido ? "opacity-40 border-border " : "") + (valido ? "border-[hsl(var(--exito)/0.7)] " : "border-border ") + (valido && sobre === est ? "bg-[hsl(var(--exito)/0.1)] " : "bg-card ")}>
                  <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border">
                    <span className="h-2 w-2 rounded-full" style={{ background: `hsl(var(${estDot[est]}))` }} />
                    <span className="font-semibold text-[13px] capitalize">{est}</span>
                    <span className="ml-auto tabular-nums text-[10.5px] text-muted-foreground bg-secondary/70 rounded-pill px-2 py-px">{data?.porEstado[est] ?? items.length}</span>
                  </div>
                  <div className="p-2.5 flex flex-col gap-2 flex-1 min-h-[52px]">
                    {items.map((t) => (
                      <div key={t.id} draggable={puedeGestionar}
                        onDragStart={() => { setDragFrom(t.estado); setDragId(t.id); }}
                        onDragEnd={() => { setDragFrom(null); setDragId(null); setSobre(null); }}
                        className={"rounded-[0.55rem] border bg-secondary/50 p-2.5 hover:-translate-y-px hover:shadow-lg transition " + (puedeGestionar ? "cursor-grab active:cursor-grabbing " : "") + (t.sla_incumplido ? "border-l-[3px] border-l-[hsl(var(--critico))] " : "border-border ") + (dragId === t.id ? "opacity-40 " : "")}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Link href={`/tickets/${t.id}`} className="font-mono text-[10.5px] text-muted-foreground hover:text-foreground">#{t.numero}</Link>
                          <Badge rol={priT[t.prioridad]} className="ml-auto text-[9.5px] px-1.5 py-0">{t.prioridad}</Badge>
                        </div>
                        <Link href={`/tickets/${t.id}`} className="block font-medium text-[12.5px] leading-snug mb-1">{t.asunto}</Link>
                        <div className="text-[10.5px] text-muted-foreground">{nombreAgente(t) ?? "sin asignar"} · {t.canal_origen ?? "—"}{t.sla_incumplido && <span className="text-[hsl(var(--critico))] font-semibold"> · SLA vencido</span>}</div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-[11px] text-muted-foreground/70 font-mono text-center py-2">vacío</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl">
          <span className="h-2 w-2 rounded-full flex-none" style={{ background: `hsl(var(${toast.ok ? "--exito" : "--critico"}))` }} />
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
