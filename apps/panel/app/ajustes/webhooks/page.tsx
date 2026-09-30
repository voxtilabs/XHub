"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";

type Wh = { id: string; url: string; eventos: string[]; activo: boolean; creado_en: string };
type Entrega = { id: string; evento: string; url: string; estado: string; ultimo_codigo: number | null; intentos: number; creado_en: string };
type Data = { datos: Wh[]; entregas: Entrega[]; eventosDisponibles: string[] };
const fecha = (s: string) => { try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };
const rolEstado = (e: string) => (e === "entregado" ? "exito" : e === "fallido" ? "critico" : "senal") as "exito" | "critico" | "senal";

export default function Webhooks() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [url, setUrl] = useState("");
  const [evs, setEvs] = useState<string[]>([]);
  const [secreto, setSecreto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setD(await apiFetch<Data>("/cliente/webhooks")); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

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
      <div className="xhub-page xhub-platform-page xhub-webhooks-page">
        <div className="xhub-page-heading">
          <div><div className="xhub-eyebrow">INTEGRACIONES · AUTOMATIZACIÓN</div><h1>Webhooks</h1><p>Tu operación conectada. Cada evento llega a donde lo necesitas.</p></div>
        </div>
        <p className="xhub-platform-description"><Icon name="shield-check" weight="regular" /> Recibe eventos de xHub en tu sistema con firma por webhook y reintentos exponenciales.</p>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}
        {secreto && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", border: "1px solid hsl(var(--exito)/0.35)" }}>
          <div className="font-medium mb-1" style={{ color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" weight="regular" /> Webhook creado. Guarda el secreto — se muestra una sola vez:</div>
          <code className="block font-mono text-[12px] break-all p-2 rounded bg-secondary">{secreto}</code>
        </div>}

        {/* Crear */}
        <Card className="mb-5"><CardContent className="pt-5">
          <h2 className="xhub-section-heading mb-4"><Icon name="webhooks-logo" weight="regular" /> Nuevo webhook</h2>
          <label htmlFor="webhook-url" className="xhub-platform-field-label">URL de destino</label>
          <Input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-sistema.cl/hooks/xhub" className="mb-3" />
          <p className="xhub-platform-field-label">Eventos que quieres recibir</p>
          <div className="xhub-event-options flex flex-wrap gap-1.5 mb-3">
            {(d?.eventosDisponibles ?? []).map((ev) => {
              const on = evs.includes(ev);
              return <button key={ev} aria-pressed={on} onClick={() => setEvs((s) => on ? s.filter((x) => x !== ev) : [...s, ev])}
                className={"px-2.5 h-7 rounded-pill text-[12px] font-mono border " + (on ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{ev}</button>;
            })}
          </div>
          <Button size="sm" onClick={crear} disabled={!url || evs.length === 0}><Icon name="plus" /> Crear webhook</Button>
        </CardContent></Card>

        {/* Endpoints */}
        <h2 className="xhub-section-heading mb-4"><Icon name="plugs-connected" weight="regular" /> Endpoints <span className="xhub-platform-count">{d?.datos.length ?? 0}</span></h2>
        {(d?.datos ?? []).length === 0 ? <Card className="mb-6"><CardContent className="py-8 text-center text-muted-foreground text-sm">Sin webhooks todavía.</CardContent></Card> : (
          <div className="flex flex-col gap-2 mb-6">
            {d!.datos.map((w) => (
              <Card key={w.id} className="xhub-webhook-endpoint"><CardContent className="py-3.5 flex items-center gap-3 flex-wrap">
                <span className="xhub-platform-glyph"><Icon name="webhooks-logo" weight="regular" /></span>
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
        <h2 className="xhub-section-heading mb-4"><Icon name="clock-counter-clockwise" weight="regular" /> Entregas recientes</h2>
        <Card><CardContent className="pt-5 overflow-x-auto">
          {(d?.entregas ?? []).length === 0 ? <div className="text-[13px] text-muted-foreground">Sin entregas todavía.</div> : (
            <table className="xhub-platform-table w-full text-sm">
              <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border"><th className="p-2 font-black">Evento</th><th className="p-2 font-black">Estado</th><th className="p-2 font-black">Código</th><th className="p-2 font-black">Cuándo</th></tr></thead>
              <tbody>{d!.entregas.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0"><td data-label="Evento" className="p-2 font-mono text-xs">{e.evento}</td><td data-label="Estado" className="p-2"><Badge rol={rolEstado(e.estado)}>{e.estado}</Badge></td><td data-label="Código" className="p-2 tabular-nums text-muted-foreground">{e.ultimo_codigo ?? "—"}</td><td data-label="Cuándo" className="p-2 text-muted-foreground text-xs whitespace-nowrap">{fecha(e.creado_en)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </CardContent></Card>
        {cargando && <div className="text-xs text-muted-foreground font-mono mt-3">Cargando…</div>}
      </div>
    </main>
  );
}
