"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getLeads, crearLead, convertirLead, archivarLead, type Lead } from "@/lib/crm";

const CANALES = ["email", "telefono", "webchat", "instagram", "messenger"];
const MONEDAS = ["CLP", "UF", "USD"];
const money = (n: number, m: string) => (m === "CLP" ? "$" : m + " ") + n.toLocaleString("es-CL");

export default function Leads() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="crm.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ canal: "email", identidad: "", titulo: "", valor: 0, moneda: "CLP", origen: "" });

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setLeads((await getLeads()).datos); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear() {
    if (f.identidad.trim().length < 3 || f.titulo.trim().length < 2) return;
    try { await crearLead({ canal: f.canal, identidad: f.identidad.trim(), titulo: f.titulo.trim(), valor: Number(f.valor), moneda: f.moneda, origen: f.origen.trim() || undefined }); setF({ canal: "email", identidad: "", titulo: "", valor: 0, moneda: "CLP", origen: "" }); setNuevo(false); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function convertir(l: Lead) {
    try { const r = await convertirLead(l.id); router.push(`/oportunidades/${r.dealId}`); } catch (e) { setError((e as Error).message); }
  }
  async function archivar(l: Lead) {
    setLeads((ls) => ls.filter((x) => x.id !== l.id));
    try { await archivarLead(l.id); } catch (e) { setError((e as Error).message); cargar(); }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{cargando ? "cargando…" : `${leads.length} prospectos por calificar`}</p>
        </div>
        <Button size="sm" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cerrar" : "+ Nuevo lead"}</Button>
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {nuevo && (
        <Card className="mb-5"><CardContent className="pt-5 flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Canal</span>
            <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm capitalize">{CANALES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="flex flex-col flex-1 min-w-[140px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Persona (identidad)</span><Input value={f.identidad} onChange={(e) => setF({ ...f, identidad: e.target.value })} placeholder="prospecto@gmail.com" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[140px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Título</span><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Interesado en depto Ñuñoa" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor</span><Input type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: Number(e.target.value) })} className="mt-1 w-24" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Moneda</span>
            <select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm">{MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Origen</span><Input value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })} placeholder="Portal, referido…" className="mt-1 w-36" /></label>
          <Button onClick={crear}>Crear</Button>
        </CardContent></Card>
      )}

      {leads.length === 0 && !cargando ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Bandeja de leads vacía. Crea el primero o llegan de tus canales.</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {leads.map((l) => (
            <Card key={l.id}><CardContent className="py-4 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.titulo}</div>
                <div className="text-[11.5px] text-muted-foreground">{[l.persona_email, l.origen].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="text-[13px] text-[hsl(var(--senal))] font-semibold tabular-nums">{money(l.valor, l.moneda)}</div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => convertir(l)}>Convertir a deal</Button>
                <Button size="sm" variant="secondary" onClick={() => archivar(l)}>Archivar</Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
