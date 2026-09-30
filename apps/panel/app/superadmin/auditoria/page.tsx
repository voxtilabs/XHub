"use client";
import { Icon } from "@/components/icon";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";

type Entrada = { seq: number; clienteId: string | null; actorTipo: string; actorId: string | null; accion: string; recurso: string | null; recursoId: string | null; resultado: string; creadoEn: string };
type Cadena = { valida: boolean; entradas: number; rotaEn: number | null };
const rol = (r: string) => (r === "ok" ? "exito" : r === "denegado" ? "aviso" : "critico") as "exito" | "aviso" | "critico";

export default function Auditoria() {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [cadena, setCadena] = useState<Cadena | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState({ actor: "", recurso: "", desde: "", hasta: "" });

  async function cargar() {
    setCargando(true); setError(null);
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
    try {
      const r = await apiFetch<{ entradas: Entrada[]; cadena: Cadena }>(`/admin/auditoria${qs ? "?" + qs : ""}`);
      setEntradas(r.entradas); setCadena(r.cadena);
    } catch (e) { setError((e as Error).message); }
    finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []);

  async function exportar() {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
    try {
      const data = await apiFetch<unknown>(`/admin/auditoria/exportar${qs ? "?" + qs : ""}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `auditoria-xhub-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-audit-page space-y-5">
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">XHUB · AUDITORÍA</div>
            <h1>Auditoría</h1>
            <p>Una historia verificable de la actividad de tu plataforma.</p>
          </div>
          {cadena && (
            <div className="flex items-center gap-2 text-xs" style={{ color: cadena.valida ? "hsl(var(--exito))" : "hsl(var(--critico))" }}>
              <Icon name={cadena.valida ? "shield-check" : "shield-warning"} className="text-xl shrink-0" />
              {cadena.valida ? `Cadena de hashes íntegra (${cadena.entradas} entradas)` : `Cadena rota en seq ${cadena.rotaEn}`}
            </div>
          )}
        </div>

        <div className="xhub-filter-bar flex flex-wrap gap-3 items-end">
          <div><label htmlFor="audit-actor" className="text-[11px] uppercase tracking-widest text-muted-foreground">Actor</label><Input id="audit-actor" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} placeholder="correo o tipo" className="mt-1 w-44" /></div>
          <div><label htmlFor="audit-recurso" className="text-[11px] uppercase tracking-widest text-muted-foreground">Acción / recurso</label><Input id="audit-recurso" value={f.recurso} onChange={(e) => setF({ ...f, recurso: e.target.value })} placeholder="p.ej. cliente.creado" className="mt-1 w-52" /></div>
          <div><label htmlFor="audit-desde" className="text-[11px] uppercase tracking-widest text-muted-foreground">Desde</label><Input id="audit-desde" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="mt-1 w-40" /></div>
          <div><label htmlFor="audit-hasta" className="text-[11px] uppercase tracking-widest text-muted-foreground">Hasta</label><Input id="audit-hasta" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} className="mt-1 w-40" /></div>
          <Button size="sm" onClick={cargar}><Icon name="magnifying-glass" /> Buscar</Button>
          <Button size="sm" variant="secondary" onClick={exportar}><Icon name="download-simple" /> Exportar firmado</Button>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}

        <Card><CardContent className="pt-6 overflow-x-auto">
          <table className="xhub-platform-table w-full text-sm">
            <thead><tr className="text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground border-b border-border">
              <th className="p-2 font-medium">Seq</th><th className="p-2 font-medium">Cuándo</th><th className="p-2 font-medium">Actor</th><th className="p-2 font-medium">Acción</th><th className="p-2 font-medium">Recurso</th><th className="p-2 font-medium">Resultado</th>
            </tr></thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.seq} className="border-b border-border last:border-0">
                  <td data-label="Secuencia" className="p-2 tabular-nums text-muted-foreground">{e.seq}</td>
                  <td data-label="Cuándo" className="p-2 tabular-nums text-muted-foreground whitespace-nowrap">{new Date(e.creadoEn).toLocaleString("es-CL")}</td>
                  <td data-label="Actor" className="p-2"><div className="text-xs">{e.actorId ?? e.actorTipo}</div><div className="text-[10px] text-muted-foreground">{e.actorTipo}</div></td>
                  <td data-label="Acción" className="p-2 font-mono text-xs">{e.accion}</td>
                  <td data-label="Recurso" className="p-2 text-xs">{e.recurso ?? "—"}{e.recursoId ? ` · ${e.recursoId.slice(0, 8)}` : ""}</td>
                  <td data-label="Resultado" className="p-2"><Badge rol={rol(e.resultado)}>{e.resultado}</Badge></td>
                </tr>
              ))}
              {!cargando && entradas.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-xs font-mono">Sin entradas para el filtro.</td></tr>}
              {cargando && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-xs font-mono">Cargando…</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </main>
  );
}
