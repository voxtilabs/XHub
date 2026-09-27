"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOportunidad, agregarActividad, marcarHecho, type OportunidadDetalle } from "@/lib/crm";

const TIPOS = [["nota", "📝 Nota"], ["llamada", "📞 Llamada"], ["reunion", "🤝 Reunión"], ["tarea", "✅ Tarea"]] as const;
const icono: Record<string, string> = { nota: "📝", llamada: "📞", reunion: "🤝", tarea: "✅" };
const clp = (n: number) => "$" + n.toLocaleString("es-CL");
const fecha = (s: string) => { try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };

export default function DetalleOportunidad() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="crm.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const id = useParams<{ id: string }>().id;
  const [o, setO] = useState<OportunidadDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tipo, setTipo] = useState<string>("nota");
  const [cuerpo, setCuerpo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try { setO(await getOportunidad(id)); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const puede = o?.puede.gestionar ?? false;
  async function agregar() {
    if (!cuerpo.trim()) return;
    setEnviando(true);
    try { await agregarActividad(id, tipo, cuerpo.trim()); setCuerpo(""); await cargar(); }
    catch (e) { setError((e as Error).message); } finally { setEnviando(false); }
  }
  async function toggle(aid: string, hecho: boolean) {
    setO((prev) => prev && { ...prev, actividades: prev.actividades.map((a) => a.id === aid ? { ...a, hecho } : a) });
    try { await marcarHecho(id, aid, hecho); } catch (e) { setError((e as Error).message); cargar(); }
  }

  if (cargando) return <div className="max-w-3xl mx-auto p-10 text-sm text-muted-foreground font-mono">Cargando…</div>;
  if (!o) return <div className="max-w-3xl mx-auto p-8"><div className="text-[13px] text-[hsl(var(--critico))]">▲ {error ?? "No encontrada"}</div><Link href="/oportunidades" className="text-[hsl(var(--senal))] text-sm underline mt-3 inline-block">← Volver al embudo</Link></div>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-7">
      <Link href="/oportunidades" className="text-[13px] text-muted-foreground hover:text-foreground">← Embudo</Link>
      <div className="flex items-start justify-between gap-3 mt-2 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge rol="senal">{o.etapa}</Badge>
            <Badge rol={o.estado === "ganada" ? "exito" : o.estado === "perdida" ? "critico" : "neutro"}>{o.estado}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1.5">{o.titulo}</h1>
          <div className="text-[13px] text-muted-foreground mt-1">{clp(o.valor)}{o.persona_email ? ` · ${o.persona_email}` : ""} · creada {fecha(o.creado_en)}</div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {puede && (
        <Card className="mb-4"><CardContent className="pt-4">
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {TIPOS.map(([v, l]) => (
              <button key={v} onClick={() => setTipo(v)} className={"px-3 h-8 rounded-md text-[13px] font-medium border " + (tipo === v ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
          </div>
          <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={3} placeholder="Registra la actividad…" className="w-full rounded-md border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="mt-2"><Button size="sm" onClick={agregar} disabled={enviando || !cuerpo.trim()}>{enviando ? "Guardando…" : "Agregar actividad"}</Button></div>
        </CardContent></Card>
      )}

      <Card><CardContent className="pt-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Actividad</div>
        {o.actividades.length === 0 ? <div className="text-[13px] text-muted-foreground">Sin actividades todavía.</div> : (
          <div className="space-y-0">
            {o.actividades.map((a) => (
              <div key={a.id} className="flex gap-3 py-2.5 border-t border-border first:border-t-0">
                <span className="text-base leading-none pt-0.5">{icono[a.tipo] ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className={"text-[13.5px] whitespace-pre-wrap " + (a.tipo === "tarea" && a.hecho ? "line-through text-muted-foreground" : "")}>{a.cuerpo}</div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">{a.tipo} · {fecha(a.creado_en)}</div>
                </div>
                {a.tipo === "tarea" && puede && (
                  <button onClick={() => toggle(a.id, !a.hecho)} title="marcar hecha"
                    className={"h-5 w-5 rounded border shrink-0 mt-0.5 grid place-items-center " + (a.hecho ? "bg-[hsl(var(--exito))] border-[hsl(var(--exito))] text-white" : "border-border")}>{a.hecho ? "✓" : ""}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
