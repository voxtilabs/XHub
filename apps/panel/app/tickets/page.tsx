"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Est = "nuevo" | "abierto" | "pendiente" | "resuelto" | "cerrado";
type Pri = "baja" | "media" | "alta" | "urgente";
type Rol = "exito" | "aviso" | "critico" | "senal" | "neutro";

const priT: Record<Pri, Rol> = { baja: "senal", media: "senal", alta: "aviso", urgente: "critico" };
const estT: Record<Est, Rol> = { nuevo: "senal", abierto: "aviso", pendiente: "neutro", resuelto: "exito", cerrado: "neutro" };
const estDot: Record<Est, string> = { nuevo: "--senal", abierto: "--aviso", pendiente: "--muted-foreground", resuelto: "--exito", cerrado: "--muted-foreground" };

// Máquina de transiciones — ESPEJO EXACTO del backend (modulos/tickets/src/index.ts).
// Mover una tarjeta en el tablero es un cambiarEstado(): las transiciones inválidas se rechazan aquí igual que en el servidor.
const KTRANS: Record<Est, Est[]> = {
  nuevo: ["abierto", "cerrado"],
  abierto: ["pendiente", "resuelto", "cerrado"],
  pendiente: ["abierto", "resuelto", "cerrado"],
  resuelto: ["abierto", "cerrado"],
  cerrado: ["abierto"],
};
const ESTADOS: Est[] = ["nuevo", "abierto", "pendiente", "resuelto", "cerrado"];

interface Ticket {
  n: number; asunto: string; persona: string; canal: string;
  estado: Est; prioridad: Pri; agente: string | null; equipo: string;
  sla: string; vencido: boolean; slaPct: number | null;
}
const SEMILLA: Ticket[] = [
  { n: 4821, asunto: "No llegó mi pedido #A-1902", persona: "Juan Pérez", canal: "whatsapp", estado: "abierto", prioridad: "alta", agente: "Camila R.", equipo: "Soporte N1", sla: "2h 10m", vencido: false, slaPct: 64 },
  { n: 4820, asunto: "Cobro duplicado en la boleta", persona: "María Soto", canal: "email", estado: "nuevo", prioridad: "urgente", agente: null, equipo: "Facturación", sla: "12m", vencido: false, slaPct: 22 },
  { n: 4818, asunto: "Consulta por horario de despacho", persona: "Pedro Díaz", canal: "webchat", estado: "pendiente", prioridad: "media", agente: "Diego M.", equipo: "Soporte N1", sla: "vencido", vencido: true, slaPct: 100 },
  { n: 4815, asunto: "Cambio de dirección de entrega", persona: "Ana Rivas", canal: "llamada", estado: "abierto", prioridad: "media", agente: "Camila R.", equipo: "Soporte N1", sla: "5h 40m", vencido: false, slaPct: 41 },
  { n: 4810, asunto: "Felicitaciones por la atención", persona: "Luis Vera", canal: "email", estado: "resuelto", prioridad: "baja", agente: "Diego M.", equipo: "Soporte N1", sla: "—", vencido: false, slaPct: null },
];
const FILTROS: (Est | "todos")[] = ["todos", "nuevo", "abierto", "pendiente", "resuelto"];
const iniciales = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

export default function Bandeja() {
  const [tickets, setTickets] = useState<Ticket[]>(SEMILLA);
  const [vista, setVista] = useState<"lista" | "tablero">("lista");
  const [filtro, setFiltro] = useState<Est | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [dragFrom, setDragFrom] = useState<Est | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [sobre, setSobre] = useState<Est | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const match = (t: Ticket) => {
    const q = busca.trim().toLowerCase();
    return !q || `#${t.n} ${t.asunto} ${t.persona}`.toLowerCase().includes(q);
  };
  const cnt = (f: Est | "todos") => tickets.filter((t) => (f === "todos" || t.estado === f) && match(t)).length;

  function mover(id: number, hacia: Est) {
    const t = tickets.find((x) => x.n === id);
    if (!t || t.estado === hacia) return;
    if (!KTRANS[t.estado].includes(hacia)) {
      setToast({ ok: false, msg: `Transición inválida: ${t.estado} → ${hacia}. El flujo no lo permite.` });
      return;
    }
    const de = t.estado;
    setTickets((prev) => prev.map((x) => {
      if (x.n !== id) return x;
      const cierra = hacia === "resuelto" || hacia === "cerrado";
      return { ...x, estado: hacia, sla: cierra ? "—" : x.slaPct == null ? "reabierto" : x.sla, vencido: cierra ? false : x.vencido, slaPct: cierra ? null : x.slaPct == null ? 30 : x.slaPct };
    }));
    setToast({ ok: true, msg: `Ticket #${id}: ${de} → ${hacia} · cambiarEstado() validó la transición` });
  }

  const rows = tickets.filter((t) => (filtro === "todos" || t.estado === filtro) && match(t));

  return (
    <main className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3 px-4 sm:px-7 py-4 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" style={{ boxShadow: "0 0 10px hsl(var(--primary))" }} />
        <span className="font-semibold text-lg tracking-tight">xTickets</span>
        <span className="text-[10px] font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5">Consola X5</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--exito))" }} /><span className="text-muted-foreground">Camila R. · Supervisor · Soporte N1</span></div>
      </header>

      <div className="max-w-6xl mx-auto p-4 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bandeja</h1>
            <div className="text-muted-foreground text-sm mt-0.5">3 sin asignar · <span className="text-[hsl(var(--critico))]">1 con SLA vencido</span></div>
          </div>
          <Button size="sm" onClick={() => (location.href = "/tickets/nuevo")}>+ Nuevo ticket</Button>
        </div>

        {/* barra de herramientas — apila en móvil, en fila desde sm */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative w-full sm:flex-1 sm:max-w-[340px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por asunto, persona o #…" className="h-9 pl-9 rounded-pill w-full" aria-label="Buscar tickets" />
          </div>
          <div className="inline-flex gap-0.5 bg-secondary/60 p-0.5 rounded-md border border-border self-start sm:self-auto sm:ml-auto">
            {(["lista", "tablero"] as const).map((v) => (
              <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
                className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-[0.4rem] text-[13px] font-medium capitalize " + (vista === v ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {v === "lista"
                  ? <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                  : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="4" width="5" height="16" rx="1.3" /><rect x="10" y="4" width="5" height="11" rx="1.3" /><rect x="17" y="4" width="4" height="14" rx="1.3" /></svg>}
                {v === "lista" ? "Lista" : "Tablero"}
              </button>
            ))}
          </div>
        </div>

        {vista === "lista" ? (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              {FILTROS.map((x) => (
                <button key={x} onClick={() => setFiltro(x)}
                  className={"inline-flex items-center gap-1.5 px-3 h-8 rounded-pill text-[13px] font-medium border capitalize " + (filtro === x ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {x === "todos" ? "Todos" : x}
                  <span className="tabular-nums text-[10px] rounded-pill px-1.5 py-px" style={{ background: filtro === x ? "hsl(var(--senal)/0.2)" : "hsl(var(--secondary))" }}>{cnt(x)}</span>
                </button>
              ))}
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                    <th className="p-3 font-black">#</th><th className="p-3 font-black">Asunto</th><th className="p-3 font-black">Prioridad</th>
                    <th className="p-3 font-black">Estado</th><th className="p-3 font-black">Agente</th><th className="p-3 font-black">Equipo</th><th className="p-3 font-black">SLA</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.n} className="border-b border-border last:border-0 hover:bg-secondary/40 cursor-pointer" onClick={() => (location.href = "/tickets/detalle")}>
                        <td className="p-3 tabular-nums text-muted-foreground">#{t.n}</td>
                        <td className="p-3"><div className="font-medium">{t.asunto}</div><div className="text-xs text-muted-foreground">{t.persona} · {t.canal}</div></td>
                        <td className="p-3"><Badge rol={priT[t.prioridad]}>{t.prioridad}</Badge></td>
                        <td className="p-3"><Badge rol={estT[t.estado]}>{t.estado}</Badge></td>
                        <td className="p-3">{t.agente ?? <span className="text-[hsl(var(--critico))] text-xs font-semibold">Sin asignar</span>}</td>
                        <td className="p-3 text-muted-foreground">{t.equipo}</td>
                        <td className="p-3"><SlaCelda t={t} /></td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-xs font-mono">Sin tickets que coincidan.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono mb-3">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
              Arrastra una tarjeta — solo se iluminan los estados a los que la máquina de transiciones permite mover.
            </div>
            <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex gap-3 items-start w-max">
              {ESTADOS.map((est) => {
                const items = tickets.filter((t) => t.estado === est && match(t));
                const arrastrando = dragFrom !== null;
                const valido = arrastrando && dragFrom !== est && KTRANS[dragFrom].includes(est);
                const invalido = arrastrando && dragFrom !== est && !KTRANS[dragFrom].includes(est);
                return (
                  <div key={est}
                    onDragOver={(e) => { if (valido) { e.preventDefault(); setSobre(est); } }}
                    onDragLeave={() => setSobre((s) => (s === est ? null : s))}
                    onDrop={(e) => { e.preventDefault(); if (dragId != null) mover(dragId, est); setSobre(null); }}
                    className={"w-[80vw] max-w-[300px] shrink-0 sm:w-[210px] sm:max-w-none flex flex-col rounded-md border min-h-[130px] transition-colors " +
                      (invalido ? "opacity-40 border-border " : "") +
                      (valido ? "border-[hsl(var(--exito)/0.7)] " : "border-border ") +
                      (valido && sobre === est ? "bg-[hsl(var(--exito)/0.1)] " : "bg-card ")}>
                    <div className="flex items-center gap-2 px-3.5 py-3 border-b border-border">
                      <span className="h-2 w-2 rounded-full" style={{ background: `hsl(var(${estDot[est]}))` }} />
                      <span className="font-semibold text-[13px] capitalize">{est}</span>
                      <span className="ml-auto tabular-nums text-[10.5px] text-muted-foreground bg-secondary/70 rounded-pill px-2 py-px">{items.length}</span>
                    </div>
                    <div className={"p-2.5 flex flex-col gap-2 flex-1 min-h-[52px] rounded-b-md " + (valido ? "outline outline-[1.5px] outline-dashed outline-[hsl(var(--exito)/0.55)] -outline-offset-[6px]" : "")}>
                      {items.map((t) => (
                        <div key={t.n} draggable
                          onDragStart={() => { setDragFrom(t.estado); setDragId(t.n); }}
                          onDragEnd={() => { setDragFrom(null); setDragId(null); setSobre(null); }}
                          onClick={() => (location.href = "/tickets/detalle")}
                          className={"rounded-[0.55rem] border bg-secondary/50 p-2.5 cursor-grab active:cursor-grabbing hover:-translate-y-px hover:shadow-lg transition " +
                            (t.vencido ? "border-l-[3px] border-l-[hsl(var(--critico))] border-y-border border-r-border " : "border-border ") +
                            (dragId === t.n ? "opacity-40 " : "")}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-mono text-[10.5px] text-muted-foreground">#{t.n}</span>
                            <Badge rol={priT[t.prioridad]} className="ml-auto text-[9.5px] px-1.5 py-0">{t.prioridad}</Badge>
                          </div>
                          <div className="font-medium text-[12.5px] leading-snug mb-2">{t.asunto}</div>
                          <div className="flex items-center gap-1.5">
                            {t.agente
                              ? <><span className="h-5 w-5 rounded-full bg-background grid place-items-center text-[9px] font-semibold text-[hsl(var(--senal))]">{iniciales(t.agente)}</span><span className="text-[10.5px] text-muted-foreground">{t.agente}</span></>
                              : <Badge rol="critico" className="text-[9px] px-1.5 py-0">sin asignar</Badge>}
                            <span className="ml-auto text-[10.5px] text-muted-foreground">{t.vencido ? <span className="text-[hsl(var(--critico))] font-semibold">SLA vencido</span> : t.slaPct == null ? "—" : t.sla}</span>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && <div className="text-[11px] text-muted-foreground/70 font-mono text-center py-2">vacío</div>}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 items-start mt-5 p-3 rounded-md bg-[hsl(var(--senal)/0.08)] border border-border text-[12.5px] text-muted-foreground">
          <span>▸</span>
          <span>La bandeja respeta la <b className="text-[hsl(var(--senal))]">jerarquía</b>: un agente ve lo suyo, un supervisor su equipo, un admin todo. El <b className="text-[hsl(var(--senal))]">SLA se calcula en horario hábil</b> — un ticket de las 17:30 con 1 h vence el lunes 9:30. Mover en el tablero llama a <b className="text-[hsl(var(--senal))]">cambiarEstado()</b>, que rechaza los saltos inválidos igual que el servidor.</span>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-pill border border-border bg-secondary text-sm shadow-2xl">
          <span className="h-2 w-2 rounded-full flex-none" style={{ background: `hsl(var(${toast.ok ? "--exito" : "--critico"}))`, boxShadow: `0 0 8px hsl(var(${toast.ok ? "--exito" : "--critico"}))` }} />
          <span>{toast.msg}</span>
        </div>
      )}
    </main>
  );
}

function SlaCelda({ t }: { t: Ticket }) {
  if (t.vencido) return <Badge rol="critico">vencido</Badge>;
  if (t.slaPct == null) return <span className="text-muted-foreground">—</span>;
  const col = t.slaPct >= 80 ? "--critico" : t.slaPct >= 60 ? "--aviso" : "--senal";
  return (
    <div className="flex flex-col gap-1">
      <span className="tabular-nums text-xs text-muted-foreground">{t.sla}</span>
      <div className="h-1.5 w-[92px] rounded-pill overflow-hidden bg-secondary">
        <span className="block h-full rounded-pill" style={{ width: `${t.slaPct}%`, background: `hsl(var(${col}))` }} />
      </div>
    </div>
  );
}
