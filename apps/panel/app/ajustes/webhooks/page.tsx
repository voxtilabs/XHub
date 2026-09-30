"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Wh = { id: string; url: string; eventos: string[]; activo: boolean; creado_en: string };
type Entrega = { id: string; evento: string; url: string; estado: string; ultimo_codigo: number | null; intentos: number; proxima_en?: string; creado_en: string };
type Data = { datos: Wh[]; entregas: Entrega[]; eventosDisponibles: string[] };
const FILTROS = [["", "Todas"], ["pendiente", "Pendientes"], ["entregado", "Entregadas"], ["fallido", "Fallidas"]] as const;
const fecha = (s: string) => { try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };
const rolEstado = (e: string) => (e === "entregado" ? "exito" : e === "fallido" ? "critico" : "senal") as "exito" | "critico" | "senal";

export default function Webhooks() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [url, setUrl] = useState("");
  const [evs, setEvs] = useState<string[]>([]);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [ents, setEnts] = useState<Entrega[]>([]);
  const [filtro, setFiltro] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setD(await apiFetch<Data>("/cliente/webhooks")); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);

  const cargarEnt = useCallback(async (estado: string, cursor?: string) => {
    try {
      const qs = new URLSearchParams(); if (estado) qs.set("estado", estado); if (cursor) qs.set("cursor", cursor);
      const r = await apiFetch<{ datos: Entrega[]; siguiente: string | null }>(`/cliente/webhooks/entregas?${qs}`);
      setEnts((prev) => cursor ? [...prev, ...r.datos] : r.datos); setSig(r.siguiente);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarEnt(filtro); }, [filtro, cargarEnt]);

  async function reintentar(id: string) {
    setReintentando(id); setError(null);
    try { await apiFetch(`/cliente/webhooks/entregas/${id}/reintentar`, { method: "POST" }); await cargarEnt(filtro); }
    catch (e) { setError((e as Error).message); } finally { setReintentando(null); }
  }

  async function crear() {
    if (!/^https:\/\//.test(url)) { setError("La URL debe empezar con https://"); return; }
    setError(null);
    try { const r = await apiFetch<{ secreto: string }>("/cliente/webhooks", { method: "POST", body: JSON.stringify({ url, eventos: evs }) }); setSecreto(r.secreto); setUrl(""); setEvs([]); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function toggle(w: Wh) { try { await apiFetch(`/cliente/webhooks/${w.id}`, { method: "PUT", body: JSON.stringify({ activo: !w.activo }) }); await cargar(); } catch (e) { setError((e as Error).message); } }
  async function borrar(w: Wh) { try { await apiFetch(`/cliente/webhooks/${w.id}`, { method: "DELETE" }); await cargar(); } catch (e) { setError((e as Error).message); } }

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Webhooks</h1>
        <p className="text-muted-foreground text-sm mb-5">Recibe eventos de xHub en tu sistema. Firma estilo Stripe (secreto por webhook); reintentos con backoff exponencial. Solo https, y bloqueamos destinos internos.</p>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
        {secreto && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", border: "1px solid hsl(var(--exito)/0.35)" }}>
          <div className="font-medium mb-1" style={{ color: "hsl(var(--exito))" }}>✓ Webhook creado. Guarda el secreto — se muestra una sola vez:</div>
          <code className="block font-mono text-[12px] break-all p-2 rounded bg-secondary">{secreto}</code>
        </div>}

        {/* Crear */}
        <Card className="mb-5"><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Nuevo webhook</div>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-sistema.cl/hooks/xhub" className="mb-3" />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(d?.eventosDisponibles ?? []).map((ev) => {
              const on = evs.includes(ev);
              return <button key={ev} onClick={() => setEvs((s) => on ? s.filter((x) => x !== ev) : [...s, ev])}
                className={"px-2.5 h-7 rounded-pill text-[12px] font-mono border " + (on ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{ev}</button>;
            })}
          </div>
          <Button size="sm" onClick={crear} disabled={!url || evs.length === 0}>Crear webhook</Button>
        </CardContent></Card>

        {/* Endpoints */}
        <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Endpoints ({d?.datos.length ?? 0})</div>
        {(d?.datos ?? []).length === 0 ? <Card className="mb-6"><CardContent className="py-8 text-center text-muted-foreground text-sm">Sin webhooks todavía.</CardContent></Card> : (
          <div className="flex flex-col gap-2 mb-6">
            {d!.datos.map((w) => (
              <Card key={w.id}><CardContent className="py-3.5 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] truncate">{w.url}</div>
                  <div className="flex gap-1 flex-wrap mt-1">{w.eventos.map((e) => <span key={e} className="rounded-pill bg-secondary px-1.5 text-[10px] font-mono">{e}</span>)}</div>
                </div>
                <Badge rol={w.activo ? "exito" : "neutro"}>{w.activo ? "activo" : "pausado"}</Badge>
                <button onClick={() => toggle(w)} className="text-[12px] text-muted-foreground hover:text-foreground">{w.activo ? "pausar" : "activar"}</button>
                <button onClick={() => borrar(w)} className="text-[12px] text-muted-foreground hover:text-[hsl(var(--critico))]">borrar</button>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Entregas */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Entregas</div>
          <div className="flex gap-1">
            {FILTROS.map(([val, lbl]) => (
              <button key={val} onClick={() => setFiltro(val)}
                className={"px-2.5 h-7 rounded-pill text-[12px] border " + (filtro === val ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{lbl}</button>
            ))}
          </div>
        </div>
        <Card><CardContent className="pt-5 overflow-x-auto">
          {ents.length === 0 ? <div className="text-[13px] text-muted-foreground">Sin entregas {filtro ? `en estado «${filtro}»` : "todavía"}.</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border"><th className="p-2 font-black">Evento</th><th className="p-2 font-black">Estado</th><th className="p-2 font-black">Código</th><th className="p-2 font-black">Intentos</th><th className="p-2 font-black">Cuándo</th><th className="p-2 font-black"></th></tr></thead>
              <tbody>{ents.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="p-2 font-mono text-xs">{e.evento}</td>
                  <td className="p-2"><Badge rol={rolEstado(e.estado)}>{e.estado}</Badge></td>
                  <td className="p-2 tabular-nums text-muted-foreground">{e.ultimo_codigo ?? "—"}</td>
                  <td className="p-2 tabular-nums text-muted-foreground">{e.intentos}</td>
                  <td className="p-2 text-muted-foreground text-xs whitespace-nowrap">{fecha(e.creado_en)}</td>
                  <td className="p-2 text-right">{e.estado === "fallido" && <button onClick={() => reintentar(e.id)} disabled={reintentando === e.id} className="text-[12px] text-[hsl(var(--senal))] hover:underline disabled:opacity-50">{reintentando === e.id ? "…" : "reintentar"}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {sig && <div className="pt-3"><Button size="sm" variant="outline" onClick={() => cargarEnt(filtro, sig)}>Cargar más</Button></div>}
        </CardContent></Card>
        {cargando && <div className="text-xs text-muted-foreground font-mono mt-3">Cargando…</div>}
      </div>
    </main>
  );
}
