"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
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
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <Link href="/superadmin" className="text-[13px] text-muted-foreground hover:text-foreground">← Clientes</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2 mb-1">Cola de muertos</h1>
        <p className="text-muted-foreground text-sm mb-5">Trabajos del conector que fallaron definitivamente, con su causa en español, la carga original y los intentos. Reintentá desde acá sin entrar al servidor.</p>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
        {msg && <div className="mb-4 p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}>✓ {msg}</div>}

        <Card className="mb-4"><CardContent className="pt-4 flex items-end gap-2 flex-wrap">
          <label className="flex flex-col flex-1 min-w-[180px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contraseña para reintentar</span><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="clave del supervisor" className="mt-1" /></label>
          <Button variant="secondary" onClick={reintentarTodos} disabled={!ms.length || ocupado === "todos"}>{ocupado === "todos" ? "Reintentando…" : "Reintentar todos"}</Button>
        </CardContent></Card>

        {ms.length === 0 ? (
          <Card><CardContent className="pt-6 pb-6 text-center text-[13px] text-muted-foreground">✓ Sin trabajos muertos. Todo el conector está al día.</CardContent></Card>
        ) : (
          <div className="space-y-2.5">
            {ms.map((m) => (
              <Card key={m.id}><CardContent className="pt-4">
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
                  <div className="flex gap-3 shrink-0 items-center">
                    <button onClick={() => reintentar(m)} disabled={ocupado === m.id} className="text-[12px] text-[hsl(var(--exito))] hover:underline disabled:opacity-50">{ocupado === m.id ? "reintentando…" : "↻ reintentar"}</button>
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
