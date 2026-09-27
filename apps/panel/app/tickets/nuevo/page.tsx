"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { crearTicket, type Prioridad } from "@/lib/tickets";

const CANALES = ["email", "whatsapp", "webchat", "llamada", "instagram"];
const PRIS: Prioridad[] = ["baja", "media", "alta", "urgente"];

export default function NuevoTicket() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="bandeja.gestionar"><Form /></RequierePermiso>
    </main>
  );
}

function Form() {
  const router = useRouter();
  const [f, setF] = useState({ canal: "email", identidad: "", asunto: "", prioridad: "media" as Prioridad, categoria: "", cuerpo: "" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function crear() {
    setEnviando(true); setError(null);
    try {
      const t = await crearTicket({ canal: f.canal, identidad: f.identidad.trim(), asunto: f.asunto.trim(), prioridad: f.prioridad, categoria: f.categoria.trim() || undefined, cuerpo: f.cuerpo.trim() || undefined });
      router.push(`/tickets/${t.id}`);
    } catch (e) { setError((e as Error).message); setEnviando(false); }
  }
  const listo = f.identidad.trim().length > 2 && f.asunto.trim().length > 2;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-8">
      <Link href="/tickets" className="text-[13px] text-muted-foreground hover:text-foreground">← Bandeja</Link>
      <h1 className="text-2xl font-semibold tracking-tight mt-2 mb-1">Nuevo ticket</h1>
      <p className="text-muted-foreground text-sm mb-5">Se crea (o reutiliza) la persona por su canal e identidad y queda en su historia omnicanal.</p>
      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
      <Card><CardContent className="pt-5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1"><span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Canal</span>
            <select value={f.canal} onChange={set("canal")} className="mt-1.5 w-full h-10 rounded-md border border-border bg-background px-3 text-sm capitalize">
              {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex-1"><span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Prioridad</span>
            <select value={f.prioridad} onChange={set("prioridad")} className="mt-1.5 w-full h-10 rounded-md border border-border bg-background px-3 text-sm capitalize">
              {PRIS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label><span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Identidad del cliente</span>
          <Input value={f.identidad} onChange={set("identidad")} placeholder={f.canal === "email" ? "juan@empresa.cl" : "+56 9 1234 5678"} className="mt-1.5" />
        </label>
        <label><span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Asunto</span>
          <Input value={f.asunto} onChange={set("asunto")} placeholder="Resumen breve del problema" className="mt-1.5" />
        </label>
        <label><span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Categoría (opcional)</span>
          <Input value={f.categoria} onChange={set("categoria")} placeholder="p.ej. despacho, facturación" className="mt-1.5" />
        </label>
        <label><span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Mensaje inicial (opcional)</span>
          <textarea value={f.cuerpo} onChange={set("cuerpo")} rows={4} placeholder="Lo que dijo el cliente. Se analiza la urgencia automáticamente." className="mt-1.5 w-full rounded-md border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <div className="flex items-center gap-2 mt-1">
          <Button onClick={crear} disabled={enviando || !listo}>{enviando ? "Creando…" : "Crear ticket"}</Button>
          <Link href="/tickets" className="text-[13px] text-muted-foreground hover:text-foreground">Cancelar</Link>
        </div>
      </CardContent></Card>
    </div>
  );
}
