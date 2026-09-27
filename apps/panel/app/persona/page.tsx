"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { apiFetch } from "@/lib/api";

type Res = { personaId: string; texto: string };
type Ident = { canal: string; identificador?: string; valor?: string };
type Item = { seq: string; tipo: string; ocurrio_en: string; modulo_origen: string; resumen: string | null };
type TicketMini = { id: string; numero: string; asunto: string; estado: string; prioridad: string };
type OpMini = { id: string; titulo: string; valor: number; etapa: string; estado: string };
type Ficha = { persona: { id: string; nombre: string | null }; identidades: Ident[]; etiquetas: { nombre: string }[]; lineaDeTiempo: Item[]; tickets: TicketMini[]; oportunidades: OpMini[] };

const fecha = (s: string) => { try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };
const iconoMod = (m: string) => m === "tickets" ? "🎫" : m === "crm" ? "💼" : "•";

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

  async function buscar(term: string) {
    setQ(term); setError(null);
    if (term.trim().length < 2) { setRes([]); return; }
    setBuscando(true);
    try { setRes((await apiFetch<{ datos: Res[] }>(`/cliente/personas?q=${encodeURIComponent(term.trim())}`)).datos); }
    catch (e) { setError((e as Error).message); } finally { setBuscando(false); }
  }
  async function abrir(id: string) {
    setError(null);
    try { setFicha(await apiFetch<Ficha>(`/cliente/personas/${id}`)); setRes([]); setQ(""); }
    catch (e) { setError((e as Error).message); }
  }

  const nombre = ficha?.persona.nombre || ficha?.identidades[0]?.identificador || ficha?.identidades[0]?.valor || "Persona";
  const inic = nombre.split(/[ @.]/).map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Personas</h1>
      <p className="text-muted-foreground text-sm mb-4">La ficha 360: una sola identidad por persona, con TODA su historia — tickets y oportunidades juntos.</p>

      <div className="relative max-w-md mb-2">
        <Input value={q} onChange={(e) => buscar(e.target.value)} placeholder="Buscar por nombre, email o teléfono…" className="h-10" />
        {(res.length > 0 || (q.length >= 2 && !buscando)) && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-2xl max-h-72 overflow-auto">
            {res.map((r) => (
              <button key={r.personaId} onClick={() => abrir(r.personaId)} className="block w-full text-left px-3 py-2 text-[13px] hover:bg-secondary">{r.texto}</button>
            ))}
            {res.length === 0 && <div className="px-3 py-2 text-[12.5px] text-muted-foreground">Sin resultados</div>}
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {!ficha ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Busca una persona para ver su ficha 360.</CardContent></Card>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-5 mt-4">
            <div className="h-14 w-14 rounded-full bg-secondary grid place-items-center text-lg font-semibold">{inic}</div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight truncate">{nombre}</h2>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {ficha.identidades.map((i, k) => <Badge key={k} rol="neutro">{i.canal}: {i.identificador ?? i.valor}</Badge>)}
                {ficha.etiquetas.map((e, k) => <Badge key={"e" + k} rol="senal">{e.nombre}</Badge>)}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_260px] gap-4">
            {/* Historia unificada */}
            <Card><CardContent className="pt-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Historia (omnicanal)</div>
              {ficha.lineaDeTiempo.length === 0 ? <div className="text-[13px] text-muted-foreground">Sin interacciones registradas.</div> : (
                <div className="space-y-0">
                  {ficha.lineaDeTiempo.map((it) => (
                    <div key={it.seq} className="flex gap-3 py-2.5 border-t border-border first:border-t-0">
                      <span className="text-base leading-none pt-0.5">{iconoMod(it.modulo_origen)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px]">{it.resumen ?? it.tipo}</div>
                        <div className="text-[10.5px] text-muted-foreground">{it.modulo_origen} · {it.tipo} · {fecha(it.ocurrio_en)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>

            {/* Tickets + Oportunidades de la persona */}
            <div className="flex flex-col gap-4">
              <Card><CardContent className="pt-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Tickets ({ficha.tickets.length})</div>
                {ficha.tickets.length === 0 ? <div className="text-[12.5px] text-muted-foreground">—</div> : ficha.tickets.map((t) => (
                  <Link key={t.id} href={`/tickets/${t.id}`} className="block py-1.5 border-t border-border first:border-t-0 hover:text-[hsl(var(--senal))]">
                    <div className="text-[12.5px] font-medium truncate">#{t.numero} {t.asunto}</div>
                    <div className="text-[10.5px] text-muted-foreground">{t.estado} · {t.prioridad}</div>
                  </Link>
                ))}
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Oportunidades ({ficha.oportunidades.length})</div>
                {ficha.oportunidades.length === 0 ? <div className="text-[12.5px] text-muted-foreground">—</div> : ficha.oportunidades.map((o) => (
                  <div key={o.id} className="py-1.5 border-t border-border first:border-t-0">
                    <div className="text-[12.5px] font-medium truncate">{o.titulo}</div>
                    <div className="text-[10.5px] text-muted-foreground">${o.valor.toLocaleString("es-CL")} · {o.etapa} · {o.estado}</div>
                  </div>
                ))}
              </CardContent></Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
