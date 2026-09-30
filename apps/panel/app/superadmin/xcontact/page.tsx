"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Check = { nombre: string; detalle: string; ms: number; ok: boolean; nota?: string };
type Resultado = { host: string; checks: Check[]; resumen: Record<string, boolean> };

export default function XContactProbe() {
  const [f, setF] = useState({ host: "x5.xcontact.cl", usuario: "voxtilabs", password: "", apiKey: "" });
  const [res, setRes] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  async function probar() {
    setProbando(true); setError(null); setRes(null);
    try { setRes(await apiFetch<Resultado>("/admin/xcontact/probe", { method: "POST", body: JSON.stringify(f) })); }
    catch (e) { setError((e as Error).message); } finally { setProbando(false); }
  }
  const R = res?.resumen;

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <Link href="/superadmin" className="text-[13px] text-muted-foreground hover:text-foreground">← Clientes</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2 mb-1">Probar XContact</h1>
        <p className="text-muted-foreground text-sm mb-5">Test de conectividad y capacidades de una instancia de XContact antes de conectarla. Verifica login, REST v4/v5, el bridge AMI y la lectura de datos.</p>

        <Card className="mb-5"><CardContent className="pt-5 flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
          <label className="flex flex-col flex-1 min-w-[160px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Host XContact</span><Input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="x5.xcontact.cl" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Supervisor</span><Input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} className="mt-1 w-36" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contraseña</span><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1 w-40" /></label>
          <label className="flex flex-col flex-1 min-w-[180px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">API key REST (v4/v2)</span><Input value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="opcional — para probar lectura v4" className="mt-1" /></label>
          <Button onClick={probar} disabled={probando || f.host.trim().length < 3}>{probando ? "Probando…" : "Probar"}</Button>
        </CardContent></Card>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

        {R && (
          <>
            <div className="flex gap-2 flex-wrap mb-4">
              {([["Alcanzable", R.alcanzable], ["Login", R.login], ["REST v4", R.restV4], ["API key REST", R.apiKeyRest], ["REST v5", R.restV5], ["AMI", R.ami], ["Lee datos", R.lecturaDatos]] as const).map(([l, v]) => (
                <Badge key={l} rol={v ? "exito" : "critico"}>{v ? "✓" : "✗"} {l}</Badge>
              ))}
            </div>
            <Card><CardContent className="pt-5">
              <div className="space-y-0">
                {res!.checks.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-t border-border first:border-t-0">
                    <span className="text-base leading-none pt-0.5">{c.ok ? "✅" : "⛔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium">{c.nombre} {c.nota && <span className="text-[11px] font-normal text-muted-foreground">· {c.nota}</span>}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{c.detalle}</div>
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{c.ms}ms</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
            <p className="text-[12px] text-muted-foreground mt-3">Nota: la lectura AMI en tiempo real requiere presencia (socket.io); un ✗ ahí es esperado desde un test REST. Lo importante para conectar el conector es login + REST.</p>
          </>
        )}
      </div>
    </main>
  );
}
