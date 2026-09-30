"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";

type Muerto = { id: string; tipo: string; causa: string; intentos: number; ultimo_intento: string; creado_en: string; cliente: string | null; instancia: string | null; carga: Record<string, unknown> };

export default function ColaMuertos() {
  const [ms, setMs] = useState<Muerto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [ocupado, setOcupado] = useState("");

  const cargar = () => apiFetch<{ datos: Muerto[] }>("/admin/conector/muertos").then((r) => setMs(r.datos)).catch((e) => setError((e as Error).message));
  useEffect(() => { cargar(); }, []);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2600); };

  async function reintentar(m: Muerto) {
    setOcupado(m.id); setError(null);
    try {
      const r = await apiFetch<{ resuelto: boolean; personas?: number }>(`/admin/conector/muertos/${m.id}/reintentar`, { method: "POST", body: JSON.stringify({ password: pass || undefined }) });
      flash(`Resuelto: ${m.tipo}${r.personas != null ? ` (${r.personas} personas)` : ""}`); cargar();
    } catch (e) { setError((e as Error).message); cargar(); } finally { setOcupado(""); }
  }
  async function descartar(m: Muerto) {
    try { await apiFetch(`/admin/conector/muertos/${m.id}`, { method: "DELETE" }); cargar(); } catch (e) { setError((e as Error).message); }
  }
  async function reintentarTodos() {
    setOcupado("todos"); setError(null);
    for (const m of ms) { try { await apiFetch(`/admin/conector/muertos/${m.id}/reintentar`, { method: "POST", body: JSON.stringify({ password: pass || undefined }) }); } catch { /* sigue con el resto */ } }
    flash("Reintento masivo terminado"); cargar(); setOcupado("");
  }

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-retry-page">
        <div className="xhub-page-heading">
          <div><Link href="/superadmin" className="xhub-eyebrow inline-flex items-center gap-2"><Icon name="arrow-left" /> PLATAFORMA · CONECTOR</Link><h1>Reintentos</h1><p>Recupera los trabajos pendientes y mantén todo conectado.</p></div>
        </div>
        <div className="xhub-platform-description"><Icon name="info" weight="regular" /><p><strong>Cola de muertos.</strong> Trabajos que fallaron definitivamente, con su causa e intentos. Reintenta desde aquí sin entrar al servidor.</p></div>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}
        {msg && <div className="mb-4 p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" weight="regular" /> {msg}</div>}

        <Card className="mb-4"><CardContent className="pt-4 flex items-end gap-2 flex-wrap">
          <label className="flex flex-col flex-1 min-w-[180px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contraseña para reintentar</span><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="clave del supervisor" className="mt-1" /></label>
          <Button variant="secondary" onClick={reintentarTodos} disabled={!ms.length || ocupado === "todos"}><Icon name="arrows-clockwise" weight="regular" />{ocupado === "todos" ? "Reintentando…" : "Reintentar todos"}</Button>
        </CardContent></Card>

        {ms.length === 0 ? (
          <Card><CardContent className="pt-6 pb-6 text-center text-[13px] text-muted-foreground"><Icon name="check-circle" className="xhub-empty-glyph" weight="regular" /> Sin trabajos muertos. Todo el conector está al día.</CardContent></Card>
        ) : (
          <div className="space-y-2.5">
            {ms.map((m) => (
              <Card key={m.id} className="xhub-retry-card"><CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[12px]">{m.tipo}</span>
                      <Badge rol="critico">{m.intentos} intento{m.intentos === 1 ? "" : "s"}</Badge>
                      <span className="text-[11.5px] text-muted-foreground">{m.cliente ?? "—"}{m.instancia ? ` · ${m.instancia}` : ""}</span>
                    </div>
                    <div className="text-[13px] mt-1">{m.causa}</div>
                    <div className="text-[10.5px] text-muted-foreground mt-0.5">último intento: {m.ultimo_intento.slice(0, 16).replace("T", " ")}</div>
                  </div>
                  <div className="xhub-platform-actions flex gap-3 items-center flex-wrap">
                    <button onClick={() => reintentar(m)} disabled={ocupado === m.id} className="text-[12px] text-[hsl(var(--exito))] hover:underline disabled:opacity-50"><Icon name="arrows-clockwise" className="xhub-inline-icon" weight="regular" /> {ocupado === m.id ? "reintentando…" : "reintentar"}</button>
                    <button onClick={() => descartar(m)} className="text-[12px] text-muted-foreground hover:text-[hsl(var(--critico))]">descartar</button>
                  </div>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
