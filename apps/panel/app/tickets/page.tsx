"use client";
import { useEffect, useState, useCallback, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { useYo } from "@/lib/permisos";
import { getBandeja, cambiarEstado, getAgentes, TRANS, ESTADOS, type Bandeja, type TicketRow, type Estado, type Prioridad } from "@/lib/tickets";
import { HeroFeatures } from "@/components/hero-features";

type Rol = "exito" | "aviso" | "critico" | "senal" | "neutro";
const priT: Record<Prioridad, Rol> = { baja: "senal", media: "senal", alta: "aviso", urgente: "critico" };
const estT: Record<Estado, Rol> = { nuevo: "senal", abierto: "aviso", pendiente: "neutro", resuelto: "exito", cerrado: "neutro" };
const estDot: Record<Estado, string> = { nuevo: "--senal", abierto: "--aviso", pendiente: "--muted-foreground", resuelto: "--exito", cerrado: "--muted-foreground" };
const FILTROS: (Estado | "todos")[] = ["todos", "nuevo", "abierto", "pendiente", "resuelto", "cerrado"];
const boardStages: Record<Estado, { icon: string; caption: string; empty: string }> = {
  nuevo: { icon: "ticket", caption: "Por revisar", empty: "Las nuevas conversaciones aparecen aquí." },
  abierto: { icon: "chats-circle", caption: "En atención", empty: "Aquí se reúne la atención en curso." },
  pendiente: { icon: "clock", caption: "En espera", empty: "Conversaciones que esperan una respuesta." },
  resuelto: { icon: "check-circle", caption: "Solucionados", empty: "Las conversaciones resueltas llegan aquí." },
  cerrado: { icon: "lock-key", caption: "Finalizados", empty: "Aquí quedan las conversaciones finalizadas." },
};

function TicketAgent({ nombre }: { nombre: string | null }) {
  return <span className="xhub-ticket-agent" data-assigned={Boolean(nombre)}><span className="xhub-ticket-agent-avatar" aria-hidden="true">{nombre ? nombre.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase() : <Icon name="user" weight="regular" />}</span><span>{nombre ?? "Sin asignar"}</span></span>;
}
function TicketChannel({ canal }: { canal: string | null }) {
  return <span className="xhub-ticket-channel-tag" data-channel={canal ?? "unknown"}><Icon name={canal === "email" ? "envelope" : canal === "telefono" || canal === "llamada" ? "phone" : canal === "whatsapp" ? "whatsapp-logo" : "chat-circle-dots"} weight="duotone" /><span>{canal ?? "—"}</span></span>;
}
function TicketPriority({ prioridad }: { prioridad: Prioridad }) {
  return <Badge rol={priT[prioridad]} className="xhub-ticket-priority" data-priority={prioridad}><span className="xhub-priority-bars" aria-hidden="true"><i /><i /><i /></span>{prioridad}</Badge>;
}
function TicketState({ estado }: { estado: Estado }) {
  return <Badge rol={estT[estado]} className="xhub-ticket-state"><span className="xhub-state-dot" aria-hidden="true" />{estado}</Badge>;
}
function TicketSla({ vencido }: { vencido?: boolean }) {
  return <span className="xhub-ticket-sla-tag" data-overdue={Boolean(vencido)}><Icon name={vencido ? "warning-circle" : "shield-check"} weight="duotone" />{vencido ? "Vencido" : "En plazo"}</span>;
}
function TicketCount({ total }: { total: number }) {
  return <><strong>{total}</strong> {total === 1 ? "ticket" : "tickets"} en esta vista</>;
}

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
    if (!TRANS[t.estado].includes(hacia)) { setToast({ ok: false, msg: `Transición inválida: de ${t.estado} a ${hacia}` }); return; }
    setData((d) => d && { ...d, datos: d.datos.map((x) => x.id === id ? { ...x, estado: hacia } : x) });
    try { await cambiarEstado(id, hacia); setToast({ ok: true, msg: `Ticket #${t.numero}: de ${t.estado} a ${hacia}` }); }
    catch (e) { setToast({ ok: false, msg: (e as Error).message }); cargar(); }
  }

  return (
    <div className="xhub-page xhub-inbox-page xhub-live-inbox">
      <div className="xhub-page-heading" data-hero="attention">
        <div>
          <div className="xhub-eyebrow">Centro de atención</div>
          <h1>Bandeja</h1>
          <p>Cada conversación, a tiempo y en su lugar.</p>
          <div className="xhub-ticket-live-status">
            {cargando ? "cargando…" : <>{tickets.length} tickets · {data?.sinAsignar ?? 0} sin asignar · {(data?.vencidos ?? 0) > 0 ? <span className="text-[hsl(var(--critico))]">{data?.vencidos} con SLA vencido</span> : "SLA al día"}</>}
          </div>
        <HeroFeatures variant="tickets" />
          </div>
        {puedeGestionar && <Button size="sm" asChild><Link href="/tickets/nuevo"><Icon name="plus" weight="regular" />Nuevo ticket</Link></Button>}
      </div>

      <div className="xhub-inbox-summary" aria-label="Resumen de la bandeja">
        <div className="xhub-inbox-metric"><span className="xhub-metric-glyph"><Icon name="chats-circle" weight="duotone" /></span><div><strong>{cargando ? "—" : tickets.length}</strong><span>Tickets en bandeja</span></div></div>
        <div className="xhub-inbox-metric"><span className="xhub-metric-glyph"><Icon name="timer" weight="duotone" /></span><div><strong>{cargando ? "—" : ["nuevo", "abierto", "pendiente"].reduce((n, e) => n + (data?.porEstado[e] ?? 0), 0)}</strong><span>Por resolver</span></div></div>
        <div className="xhub-inbox-metric"><span className="xhub-metric-glyph"><Icon name="user-circle" weight="duotone" /></span><div><strong>{cargando ? "—" : data?.sinAsignar ?? 0}</strong><span>Sin asignar</span></div></div>
        <div className="xhub-inbox-metric" data-tone={cargando ? undefined : (data?.vencidos ?? 0) > 0 ? "critical" : "success"}><span className="xhub-metric-glyph"><Icon name={(data?.vencidos ?? 0) > 0 ? "warning-circle" : "shield-check"} weight="duotone" /></span><div><strong>{cargando ? "—" : data?.vencidos ?? 0}</strong><span>Con SLA vencido</span></div></div>
      </div>

      {error && <div role="alert" className="xhub-ticket-alert mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" />{error}</div>}

      <section className="xhub-inbox-surface xhub-inbox-console" data-view={vista} aria-label="Tickets">
      <div className="xhub-filter-bar flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="xhub-console-heading"><span className="xhub-console-glyph" aria-hidden="true"><Icon name="stack" weight="duotone" /></span><div><h2>Conversaciones</h2><p>{cargando ? "Cargando tickets…" : <TicketCount total={vista === "lista" ? rows.length : tickets.filter(match).length} />}</p></div></div>
        <div className="xhub-console-search relative w-full sm:flex-1 sm:max-w-[340px]">
          <Icon name="magnifying-glass" weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2 text-[22px] text-muted-foreground pointer-events-none" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por asunto o #…" className="h-9 pl-9 rounded-pill w-full" aria-label="Buscar tickets" />
        </div>
        <div className="xhub-segmented-control inline-flex gap-0.5 bg-secondary/60 p-0.5 rounded-md border border-border self-start sm:self-auto sm:ml-auto">
          {(["lista", "tablero"] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
              className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-[0.4rem] text-[13px] font-medium capitalize " + (vista === v ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon name={v === "lista" ? "list-bullets" : "kanban"} weight={vista === v ? "fill" : "regular"} />{v === "lista" ? "Lista" : "Tablero"}
            </button>
          ))}
        </div>
      </div>

      {vista === "lista" ? (
        <>
          <div className="xhub-ticket-filters xhub-live-filters flex gap-2 mb-4 flex-wrap items-center">
            <div className="xhub-assignment-filters" role="group" aria-label="Filtrar por agente">
            {([["mios", "Míos"], ["sin", "Sin asignar"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVistaRapida(vistaRapida === v ? "todos" : v)} aria-pressed={vistaRapida === v}
                className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-[13px] font-medium border " + (vistaRapida === v ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <Icon name={v === "mios" ? "user-circle" : "user"} weight="regular" />{l}
              </button>
            ))}
            </div>
            <div className="xhub-status-filters" role="group" aria-label="Filtrar por estado">
            {FILTROS.map((x) => (
              <button key={x} onClick={() => setFiltro(x)} aria-pressed={filtro === x} data-status={x}
                className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-[13px] font-medium border capitalize " + (filtro === x ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <span className="xhub-filter-label">{x === "todos" ? "Todos" : x}</span>
                <span className="xhub-filter-count tabular-nums text-[10px] rounded-pill px-1.5 py-px">{cnt(x)}</span>
              </button>
            ))}
            </div>
          </div>
          {/* Móvil: lista de tarjetas (la tabla de 7 columnas es ilegible en 390px) */}
          <div className="xhub-ticket-mobile-list sm:hidden flex flex-col gap-2">
            {rows.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="xhub-ticket-mobile-card block rounded-lg border border-border bg-card p-3 active:bg-secondary/50">
                <div className="xhub-ticket-mobile-top"><span className="xhub-ticket-number">#{t.numero}</span><TicketChannel canal={t.canal_origen} /><Icon name="arrow-up-right" className="xhub-ticket-open-icon" /></div>
                <div className="xhub-ticket-mobile-subject">{t.asunto}</div>
                {t.resumen && <p className="xhub-ticket-mobile-summary">{t.resumen}</p>}
                <div className="xhub-ticket-mobile-tags"><TicketPriority prioridad={t.prioridad} /><TicketState estado={t.estado} /></div>
                <div className="xhub-ticket-mobile-meta"><TicketAgent nombre={nombreAgente(t)} /><TicketSla vencido={t.sla_incumplido} /></div>
              </Link>
            ))}
            {!cargando && rows.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No hay tickets{busca ? " que coincidan" : " todavía"}.</div>}
            {cargando && <div className="p-8 text-center text-muted-foreground text-xs font-mono">Cargando…</div>}
          </div>

          {/* Desktop: tabla */}
          <Card className="xhub-ticket-desktop-list hidden sm:block">
            <div className="overflow-x-auto">
              <table className="xhub-data-table xhub-live-ticket-table w-full text-sm">
                <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th scope="col" className="p-3 font-black">Conversación</th><th scope="col" className="p-3 font-black">Prioridad</th><th scope="col" className="p-3 font-black">Estado</th><th scope="col" className="p-3 font-black">Agente</th><th scope="col" className="p-3 font-black">Canal</th><th scope="col" className="p-3 font-black">SLA</th>
                </tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer">
                      <td className="p-3"><div className="xhub-ticket-conversation-cell"><span className="xhub-conversation-glyph" aria-hidden="true"><Icon name="chats-circle" weight="duotone" /></span><div><Link href={`/tickets/${t.id}`} className="xhub-ticket-subject">{t.asunto}</Link><div className="xhub-ticket-subline"><Link href={`/tickets/${t.id}`} className="xhub-ticket-number">#{t.numero}</Link>{t.resumen && <span className="xhub-ticket-summary">{t.resumen}</span>}</div></div></div></td>
                      <td className="p-3"><TicketPriority prioridad={t.prioridad} /></td>
                      <td className="p-3"><TicketState estado={t.estado} /></td>
                      <td className="p-3"><TicketAgent nombre={nombreAgente(t)} /></td>
                      <td className="p-3"><TicketChannel canal={t.canal_origen} /></td>
                      <td className="p-3"><div className="xhub-ticket-row-end"><TicketSla vencido={t.sla_incumplido} /><Icon name="arrow-up-right" className="xhub-ticket-open-icon" /></div></td>
                    </tr>
                  ))}
                  {!cargando && rows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground text-sm">No hay tickets{busca ? " que coincidan" : " todavía"}. {puedeGestionar && !busca && <Link href="/tickets/nuevo" className="text-[hsl(var(--senal))] underline">Crea el primero</Link>}</td></tr>}
                  {cargando && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground text-xs font-mono">Cargando…</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <div className="xhub-board-workspace">
          <div className="xhub-board-toolbar"><span><Icon name="kanban" weight="regular" />Flujo de atención <small>{ESTADOS.length} estados</small></span>{puedeGestionar && <span className="xhub-board-drag-guide"><Icon name="arrows-out-cardinal" weight="regular" />Arrastra para cambiar el estado</span>}<span className="xhub-board-touch-guide">Desliza para ver los estados<Icon name="arrow-right" weight="regular" /></span></div>
        <div className="xhub-ticket-board overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Tablero de tickets por estado">
          <div className="xhub-board-lanes">
            {ESTADOS.map((est) => {
              const items = tickets.filter((t) => t.estado === est && match(t));
              const arrastrando = dragFrom !== null;
              const valido = arrastrando && dragFrom !== est && TRANS[dragFrom].includes(est);
              const invalido = arrastrando && dragFrom !== est && !TRANS[dragFrom].includes(est);
              return (
                <div key={est} data-status={est} data-populated={items.length > 0} style={{ "--lane-accent": est === "abierto" ? "var(--voxia-action-text)" : `hsl(var(${estDot[est]}))` } as CSSProperties} data-drop-state={invalido ? "invalid" : valido && sobre === est ? "over" : valido ? "valid" : undefined}
                  onDragOver={(e) => { if (valido) { e.preventDefault(); setSobre(est); } }}
                  onDragLeave={() => setSobre((s) => (s === est ? null : s))}
                  onDrop={(e) => { e.preventDefault(); if (dragId != null) mover(dragId, est); setSobre(null); }}
                  className={"xhub-ticket-board-column w-[80vw] max-w-[300px] shrink-0 sm:w-[220px] sm:max-w-none flex flex-col rounded-md border min-h-[130px] transition-colors " + (invalido ? "opacity-40 border-border " : "") + (valido ? "border-[hsl(var(--exito)/0.7)] " : "border-border ") + (valido && sobre === est ? "bg-[hsl(var(--exito)/0.1)] " : "bg-card ")}>
                  <div className="xhub-board-column-heading">
                    <div className="xhub-board-stage-title"><span className="xhub-board-stage-icon" aria-hidden="true"><Icon name={boardStages[est].icon} weight="duotone" /></span><h3>{est}</h3></div>
                    <div className="xhub-board-stage-summary"><span className="xhub-board-stage-count" aria-label={`${items.length} tickets ${est} en esta vista`}>{items.length}</span><p>{boardStages[est].caption}</p></div>
                  </div>
                  <div className="xhub-board-column-body">
                    {items.map((t) => (
                      <div key={t.id} draggable={puedeGestionar} data-sla-overdue={t.sla_incumplido || undefined}
                        onDragStart={() => { setDragFrom(t.estado); setDragId(t.id); }}
                        onDragEnd={() => { setDragFrom(null); setDragId(null); setSobre(null); }}
                        className={"xhub-ticket-board-card rounded-[0.55rem] border bg-secondary/50 p-2.5 hover:-translate-y-px hover:shadow-lg transition " + (puedeGestionar ? "cursor-grab active:cursor-grabbing " : "") + (t.sla_incumplido ? "border-l-[3px] border-l-[hsl(var(--critico))] " : "border-border ") + (dragId === t.id ? "opacity-40 " : "")}>
                        <div className="xhub-board-card-top">
                          <Link href={`/tickets/${t.id}`} className="font-mono text-[10.5px] text-muted-foreground hover:text-foreground">#{t.numero}</Link>
                          <TicketChannel canal={t.canal_origen} />
                        </div>
                        <Link href={`/tickets/${t.id}`} className="xhub-board-subject" title={t.asunto}><span>{t.asunto}</span><Icon name="arrow-up-right" weight="regular" /></Link>
                        <div className="xhub-board-ticket-meta"><TicketPriority prioridad={t.prioridad} />{t.sla_incumplido && <TicketSla vencido />}</div>
                        <div className="xhub-board-card-footer"><TicketAgent nombre={nombreAgente(t)} />{puedeGestionar && <span className="xhub-board-card-grip" aria-hidden="true"><Icon name="arrows-out-cardinal" weight="regular" /></span>}</div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="xhub-board-empty"><div className="xhub-board-empty-art" aria-hidden="true"><span className="xhub-board-empty-icon"><Icon name={cargando ? "circle-notch" : boardStages[est].icon} weight="duotone" className={cargando ? "animate-spin" : ""} /></span></div><strong>{cargando ? "Cargando tickets…" : valido ? "Suelta el ticket aquí" : busca.trim() ? "Sin coincidencias" : "Sin tickets"}</strong><p>{cargando ? "Un momento, por favor." : valido ? `Mover a ${est}` : busca.trim() ? "Prueba con otra búsqueda." : boardStages[est].empty}</p></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
      </section>

      {toast && (
        <div role="status" className="xhub-ticket-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl">
          <span className="h-2 w-2 rounded-full flex-none" style={{ background: `hsl(var(${toast.ok ? "--exito" : "--critico"}))` }} />
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
