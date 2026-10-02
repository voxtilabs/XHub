"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { apiFetch } from "@/lib/api";

type Res = { personaId: string; texto: string; nombre: string | null; identidades: { canal: string; valor: string }[] };
const CANAL_ETQ: Record<string, string> = { telefono: "Teléfono", email: "Email", rut: "RUT", xcontact: "XContact", webchat: "Webchat", instagram: "Instagram", messenger: "Messenger" };
const CANAL_ICONO: Record<string, string> = { telefono: "phone", email: "envelope-simple", rut: "identification-card", xcontact: "arrows-clockwise", webchat: "chat-circle-dots", instagram: "chat-circle-dots", messenger: "chat-circle-dots" };
type Ident = { canal: string; identificador?: string; valor?: string };
type Item = { seq: string; tipo: string; ocurrio_en: string; modulo_origen: string; resumen: string | null };
type TicketMini = { id: string; numero: string; asunto: string; estado: string; prioridad: string };
type OpMini = { id: string; titulo: string; valor: number; etapa: string; estado: string };
type Campo = { nombre: string; tipo: string; valor: unknown };
type Enlace = { origen_tipo: string; origen_id: string; tipo_enlace: string; destino_tipo: string; destino_id: string };
type Fuente = { tipo: string; externoId: string | null; ultimoDato: string | null } | null;
type Ficha = {
  persona: { id: string; nombre: string | null }; identidades: Ident[]; etiquetas: { nombre: string }[];
  campos: Campo[]; lineaDeTiempo: Item[]; enlaces: Enlace[]; tickets: TicketMini[]; oportunidades: OpMini[]; fuente: Fuente;
};

const fecha = (s: string) => { try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };
const dia = (s: string) => { try { return new Date(s).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }); } catch { return s; } };
// Tiempo relativo en español, sin dependencias.
function relativo(s: string): string {
  const t = new Date(s).getTime(); if (isNaN(t)) return "";
  const seg = Math.round((Date.now() - t) / 1000);
  if (seg < 60) return "recién"; const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`; const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`; const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} d`; const me = Math.round(d / 30);
  if (me < 12) return `hace ${me} mes${me > 1 ? "es" : ""}`; return `hace ${Math.round(me / 12)} año(s)`;
}
const MODULOS: Record<string, { etq: string; icono: string }> = {
  tickets: { etq: "Tickets", icono: "ticket" }, crm: { etq: "CRM", icono: "kanban" },
  conector: { etq: "XContact", icono: "arrows-clockwise" }, nucleo: { etq: "Núcleo", icono: "identification-card" },
};
const modInfo = (m: string) => MODULOS[m] ?? { etq: m, icono: "chat-circle-dots" };
const valorCampo = (v: unknown) => v == null ? "—" : typeof v === "boolean" ? (v ? "Sí" : "No") : typeof v === "object" ? JSON.stringify(v) : String(v);

export default function Persona() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="ficha360.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Res[]>([]);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [filtro, setFiltro] = useState<string>("");

  async function buscar(term: string) {
    setQ(term); setError(null);
    if (term.trim().length < 2) { setRes([]); return; }
    setBuscando(true);
    try { setRes((await apiFetch<{ datos: Res[] }>(`/cliente/personas?q=${encodeURIComponent(term.trim())}`)).datos); }
    catch (e) { setError((e as Error).message); } finally { setBuscando(false); }
  }
  async function abrir(id: string) {
    setError(null); setFiltro("");
    try { setFicha(await apiFetch<Ficha>(`/cliente/personas/${id}`)); setRes([]); setQ(""); }
    catch (e) { setError((e as Error).message); }
  }

  const nombre = ficha?.persona.nombre || ficha?.identidades[0]?.identificador || ficha?.identidades[0]?.valor || "Persona";
  const inic = nombre.split(/[ @.]/).map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  // Conteos por módulo para los chips del filtro + resumen temporal.
  const tl = ficha?.lineaDeTiempo ?? [];
  const porModulo = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of tl) m.set(it.modulo_origen, (m.get(it.modulo_origen) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tl]);
  const tlVisible = filtro ? tl.filter((it) => it.modulo_origen === filtro) : tl;
  const primera = tl.length ? tl[tl.length - 1].ocurrio_en : null; // timeline viene desc → la última fila es la más antigua
  const ultima = tl.length ? tl[0].ocurrio_en : null;

  return (
    <div className="xhub-page xhub-crm-page crm-person-page">
      <div className="xhub-page-heading crm-person-hero">
        <div className="crm-person-hero-copy">
          <div className="xhub-eyebrow"><span />Conexiones con historia</div>
          <h1>Personas</h1>
          <p>Todo el contexto.<br /><span>Una sola conversación.</span></p>
          <div className="crm-person-hero-features">
            <span><Icon name="identification-card" weight="duotone" />Ficha 360</span>
            <span><Icon name="clock-counter-clockwise" weight="regular" />Historia omnicanal</span>
          </div>
        </div>
      </div>

      <div className="crm-person-search relative mb-2">
        <Icon name="magnifying-glass" weight="regular" />
        <Input aria-label="Buscar personas" value={q} onChange={(e) => buscar(e.target.value)} placeholder="Buscar por nombre, email o teléfono…" className="h-10" />
        {(res.length > 0 || (q.length >= 2 && !buscando)) && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-2xl max-h-72 overflow-auto">
            {res.map((r) => (
              <button key={r.personaId} onClick={() => abrir(r.personaId)} className="crm-person-result">
                <Icon name="user-circle" weight="duotone" /><span className="min-w-0 flex-1 text-left"><span className="block text-[13px] font-medium truncate">{r.nombre || <span className="text-muted-foreground italic">Sin nombre</span>}</span>
                {r.identidades.length > 0 && (
                  <span className="flex gap-1.5 flex-wrap mt-0.5">
                    {r.identidades.slice(0, 4).map((i, k) => (
                      <span key={k} className="text-[11px] text-muted-foreground font-mono break-anywhere"><Icon name={CANAL_ICONO[i.canal] ?? "user-circle"} weight="regular" /> <span className="sr-only">{CANAL_ETQ[i.canal] ?? i.canal}: </span>{i.valor}</span>
                    ))}
                  </span>
                )}
                </span><Icon name="arrow-right" weight="regular" />
              </button>
            ))}
            {res.length === 0 && <div className="px-3 py-2 text-[12.5px] text-muted-foreground">Sin resultados</div>}
          </div>
        )}
      </div>

      {buscando && <div className="crm-loading" role="status"><Icon name="spinner-gap" />Buscando personas…</div>}
      {error && <div role="alert" className="crm-error mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" /> {error}</div>}

      {!ficha ? (
        <Card className="crm-person-welcome"><CardContent className="crm-empty"><Icon name="identification-card" weight="duotone" /><h2>Conoce la historia completa</h2><p>Busca una persona para ver su ficha 360.</p><div className="crm-person-capabilities"><span><Icon name="chats-circle" weight="duotone" />Historia omnicanal</span><span><Icon name="ticket" weight="duotone" />Tickets conectados</span><span><Icon name="kanban" weight="duotone" />Oportunidades</span></div></CardContent></Card>
      ) : (
        <>
          <div className="crm-person-profile">
            <div className="crm-person-avatar">{inic}</div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight truncate">{nombre}</h2>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {ficha.identidades.map((i, k) => <Badge key={k} rol="neutro">{(CANAL_ETQ[i.canal] ?? i.canal)}: {i.identificador ?? i.valor}</Badge>)}
                {ficha.etiquetas.map((e, k) => <Badge key={"e" + k} rol="senal">{e.nombre}</Badge>)}
              </div>
            </div>
          </div>

          {/* Resumen: la foto de un vistazo */}
          <div className="crm-person-stats grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { k: "Interacciones", v: String(tl.length) },
              { k: "Tickets", v: String(ficha.tickets.length) },
              { k: "Oportunidades", v: String(ficha.oportunidades.length) },
              { k: "Primer contacto", v: primera ? relativo(primera) : "—" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="text-lg font-semibold tracking-tight leading-tight">{s.v}</div>
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
              </div>
            ))}
          </div>

          {ficha.fuente?.tipo === "xcontact" && (() => {
            const ud = ficha.fuente.ultimoDato ? new Date(ficha.fuente.ultimoDato) : null;
            const dias = ud ? Math.floor((Date.now() - ud.getTime()) / 86400000) : null;
            const vieja = dias != null && dias > 7;
            return (
              <div role="status" className="crm-source-notice mb-4 p-2.5 rounded-md text-[12.5px] flex items-center gap-2 flex-wrap"
                style={{ background: vieja ? "hsl(var(--aviso)/0.1)" : "hsl(var(--secondary))", color: vieja ? "hsl(var(--aviso))" : "hsl(var(--muted-foreground))" }}>
                <Icon name={vieja ? "warning-circle" : "arrows-clockwise"} weight="regular" />
                <span>Datos espejados de <b>XContact</b> (id {ficha.fuente.externoId}). {ud ? <>Última sincronización: {ud.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}{vieja ? ` · desactualizados (${dias} días)` : ""}.</> : "sin fecha de sincronización."} xHub muestra su copia aunque la fuente esté caída.</span>
              </div>
            );
          })()}

          <div className="crm-person-layout">
            {/* Historia unificada, con filtro por módulo */}
            <Card><CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="crm-section-title"><Icon name="clock-counter-clockwise" weight="duotone" /><h2>Historia omnicanal</h2></div>
                {ultima && <div className="text-[10.5px] text-muted-foreground">últ. actividad {relativo(ultima)}</div>}
              </div>
              {porModulo.length > 1 && (
                <div className="crm-person-timeline-filters flex gap-1.5 flex-wrap mb-3">
                  <button aria-pressed={filtro === ""} onClick={() => setFiltro("")} className={`text-[11px] px-2 py-0.5 rounded-full border ${filtro === "" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:bg-secondary"}`}>Todo ({tl.length})</button>
                  {porModulo.map(([m, n]) => (
                    <button key={m} aria-pressed={filtro === m} onClick={() => setFiltro(m === filtro ? "" : m)} className={`text-[11px] px-2 py-0.5 rounded-full border ${filtro === m ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:bg-secondary"}`}><Icon name={modInfo(m).icono} weight="regular" /> {modInfo(m).etq} ({n})</button>
                  ))}
                </div>
              )}
              {tlVisible.length === 0 ? <div className="text-[13px] text-muted-foreground">Sin interacciones registradas.</div> : (
                <div className="space-y-0">
                  {tlVisible.map((it) => (
                    <div key={it.seq} className="crm-timeline-row">
                      <span className="crm-timeline-icon" title={modInfo(it.modulo_origen).etq}><Icon name={modInfo(it.modulo_origen).icono} weight="duotone" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px]">{it.resumen ?? it.tipo}</div>
                        <div className="text-[10.5px] text-muted-foreground">{modInfo(it.modulo_origen).etq} · {it.tipo} · {fecha(it.ocurrio_en)} · {relativo(it.ocurrio_en)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>

            {/* Columna derecha: datos del cliente, tickets, oportunidades, enlaces */}
            <div className="flex flex-col gap-4">
              {ficha.campos.length > 0 && (
                <Card><CardContent className="pt-5">
                  <div className="crm-section-title"><Icon name="identification-card" weight="duotone" /><h2>Datos</h2></div>
                  {ficha.campos.map((cp, k) => (
                    <div key={k} className="py-1.5 border-t border-border first:border-t-0">
                      <div className="text-[10.5px] text-muted-foreground">{cp.nombre}</div>
                      <div className="text-[12.5px] font-medium break-words">{valorCampo(cp.valor)}</div>
                    </div>
                  ))}
                </CardContent></Card>
              )}
              <Card><CardContent className="pt-5">
                <div className="crm-section-title"><Icon name="ticket" weight="duotone" /><h2>Tickets <span>{ficha.tickets.length}</span></h2></div>
                {ficha.tickets.length === 0 ? <div className="text-[12.5px] text-muted-foreground">—</div> : ficha.tickets.map((t) => (
                  <Link key={t.id} href={`/tickets/${t.id}`} className="crm-person-related block py-1.5 border-t border-border first:border-t-0 hover:text-[hsl(var(--senal))]">
                    <div className="text-[12.5px] font-medium truncate">#{t.numero} {t.asunto}</div>
                    <div className="text-[10.5px] text-muted-foreground">{t.estado} · {t.prioridad}</div>
                  </Link>
                ))}
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <div className="crm-section-title"><Icon name="kanban" weight="duotone" /><h2>Oportunidades <span>{ficha.oportunidades.length}</span></h2></div>
                {ficha.oportunidades.length === 0 ? <div className="text-[12.5px] text-muted-foreground">—</div> : ficha.oportunidades.map((o) => (
                  <div key={o.id} className="crm-person-related py-1.5 border-t border-border first:border-t-0">
                    <div className="text-[12.5px] font-medium truncate">{o.titulo}</div>
                    <div className="text-[10.5px] text-muted-foreground">${o.valor.toLocaleString("es-CL")} · {o.etapa} · {o.estado}</div>
                  </div>
                ))}
              </CardContent></Card>
              {ficha.enlaces.length > 0 && (
                <Card><CardContent className="pt-5">
                  <div className="crm-section-title"><Icon name="plugs-connected" weight="duotone" /><h2>Enlaces <span>{ficha.enlaces.length}</span></h2></div>
                  {ficha.enlaces.map((e, k) => (
                    <div key={k} className="py-1.5 border-t border-border first:border-t-0 text-[11.5px]">
                      <span className="font-mono text-muted-foreground">{e.origen_tipo}</span>
                      <span className="mx-1 text-[hsl(var(--senal))]"><Icon name="arrow-right" className="xhub-inline-icon" /> {e.tipo_enlace} <Icon name="arrow-right" className="xhub-inline-icon" /></span>
                      <span className="font-mono text-muted-foreground">{e.destino_tipo}</span>
                    </div>
                  ))}
                </CardContent></Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
