"use client";
import { Icon } from "@/components/icon";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type IA = { contexto: string | null; modelo: string | null };
type Dato = { etiqueta: string; valor: string };
type Ejemplo = { entrada: string; salida: string; ambito: "resumen" | "respuesta" | "todos" };
type Rico = { datos: Dato[]; ejemplos: Ejemplo[] };

export default function AjustesIA() {
  const [contexto, setContexto] = useState("");
  const [modelo, setModelo] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [datos, setDatos] = useState<Dato[]>([]);
  const [ejemplos, setEjemplos] = useState<Ejemplo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoRico, setGuardandoRico] = useState(false);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2400); };

  useEffect(() => {
    Promise.all([
      apiFetch<IA>("/cliente/ia"),
      apiFetch<Rico>("/cliente/ia-datos").catch(() => ({ datos: [], ejemplos: [] })),
    ]).then(([ia, rico]) => {
      setContexto(ia.contexto ?? ""); setOriginal(ia.contexto ?? ""); setModelo(ia.modelo);
      setDatos(rico.datos ?? []); setEjemplos(rico.ejemplos ?? []);
    }).catch((e) => setError((e as Error).message)).finally(() => setCargando(false));
  }, []);

  async function guardar() {
    setError(null); setGuardando(true);
    try {
      const r = await apiFetch<{ contexto: string | null }>("/cliente/ia", { method: "PUT", body: JSON.stringify({ contexto }) });
      setOriginal(r.contexto ?? ""); flash("Contexto guardado");
    } catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
  }
  async function guardarRico() {
    setError(null); setGuardandoRico(true);
    try {
      const r = await apiFetch<Rico>("/cliente/ia-datos", { method: "PUT", body: JSON.stringify({ datos, ejemplos }) });
      setDatos(r.datos ?? []); setEjemplos(r.ejemplos ?? []); flash("Datos y ejemplos guardados");
    } catch (e) { setError((e as Error).message); } finally { setGuardandoRico(false); }
  }

  const sucio = contexto !== original;

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page" style={{ maxWidth: 720 }}>
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DEL ESPACIO</div>
            <h1>Inteligencia artificial</h1>
            <p>Dale a la IA el contexto de tu negocio para que resuma y sugiera mejor.</p>
          </div>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> {msg}</div>}

        {/* 1) System prompt libre */}
        <Card><CardContent className="pt-5">
          <label className="block">
            <span className="text-[14px] font-semibold">Contexto para la IA <span className="text-muted-foreground font-normal">(rubro, tono, instrucciones)</span></span>
            <textarea
              value={contexto} onChange={(e) => setContexto(e.target.value)} disabled={cargando}
              rows={6} maxLength={4000}
              placeholder="Ej.: Somos una inmobiliaria en Santiago. Tono cercano y formal. No prometas fechas de entrega. Los reclamos por postventa se derivan al área de mantención."
              className="mt-2 w-full rounded-md border border-border bg-secondary/40 p-3 text-[13px] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </label>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-muted-foreground">{contexto.length}/4000 · Se antepone a los prompts de resumen y sugerencia.</span>
            <Button size="sm" onClick={guardar} disabled={guardando || !sucio}>{guardando ? "Guardando…" : "Guardar contexto"}</Button>
          </div>
        </CardContent></Card>

        {/* 2) Datos estructurados del negocio */}
        <Card className="mt-3"><CardContent className="pt-5">
          <div className="text-[14px] font-semibold">Datos del negocio</div>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-3">Pares etiqueta → valor que la IA tiene siempre a mano (horarios, sucursales, qué derivar a dónde, qué NO prometer…).</p>
          <div className="space-y-2">
            {datos.map((d, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input value={d.etiqueta} onChange={(e) => setDatos((xs) => xs.map((x, k) => k === i ? { ...x, etiqueta: e.target.value } : x))}
                  placeholder="Etiqueta (ej. Horario)" maxLength={120}
                  className="w-1/3 rounded-md border border-border bg-secondary/40 px-2.5 h-9 text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
                <input value={d.valor} onChange={(e) => setDatos((xs) => xs.map((x, k) => k === i ? { ...x, valor: e.target.value } : x))}
                  placeholder="Valor (ej. Lun a Vie 9–18h)" maxLength={600}
                  className="flex-1 rounded-md border border-border bg-secondary/40 px-2.5 h-9 text-[13px] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
                <button onClick={() => setDatos((xs) => xs.filter((_, k) => k !== i))} className="h-9 w-9 grid place-items-center rounded-md text-muted-foreground hover:text-[hsl(var(--critico))] hover:bg-secondary shrink-0" title="Quitar"><Icon name="x" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setDatos((xs) => [...xs, { etiqueta: "", valor: "" }])} className="mt-2 text-[12.5px] text-[hsl(var(--senal))] hover:underline">+ Agregar dato</button>
        </CardContent></Card>

        {/* 3) Ejemplos few-shot */}
        <Card className="mt-3"><CardContent className="pt-5">
          <div className="text-[14px] font-semibold">Ejemplos de respuestas <span className="text-muted-foreground font-normal text-[12px]">(few-shot)</span></div>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-3">Pares entrada → respuesta ideal para guiar el tono y la forma. La IA los imita, no los copia literal.</p>
          <div className="space-y-3">
            {ejemplos.map((e, i) => (
              <div key={i} className="rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <select value={e.ambito} onChange={(ev) => setEjemplos((xs) => xs.map((x, k) => k === i ? { ...x, ambito: ev.target.value as Ejemplo["ambito"] } : x))}
                    className="text-[11.5px] rounded-md border border-border bg-secondary/40 h-7 px-2 focus:outline-none">
                    <option value="todos">Ambos (resumen y respuesta)</option>
                    <option value="respuesta">Solo sugerencia de respuesta</option>
                    <option value="resumen">Solo resumen</option>
                  </select>
                  <button onClick={() => setEjemplos((xs) => xs.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-[hsl(var(--critico))]" title="Quitar"><Icon name="x" /></button>
                </div>
                <textarea value={e.entrada} onChange={(ev) => setEjemplos((xs) => xs.map((x, k) => k === i ? { ...x, entrada: ev.target.value } : x))}
                  rows={2} maxLength={1000} placeholder="Entrada (lo que llega del cliente)"
                  className="w-full rounded-md border border-border bg-secondary/40 p-2 text-[12.5px] resize-y mb-1.5 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
                <textarea value={e.salida} onChange={(ev) => setEjemplos((xs) => xs.map((x, k) => k === i ? { ...x, salida: ev.target.value } : x))}
                  rows={2} maxLength={1000} placeholder="Respuesta ideal (el tono/forma que querés)"
                  className="w-full rounded-md border border-border bg-secondary/40 p-2 text-[12.5px] resize-y focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
              </div>
            ))}
          </div>
          <button onClick={() => setEjemplos((xs) => [...xs, { entrada: "", salida: "", ambito: "todos" }])} className="mt-2 text-[12.5px] text-[hsl(var(--senal))] hover:underline">+ Agregar ejemplo</button>
          <div className="flex justify-end mt-3 pt-3 border-t border-border">
            <Button size="sm" onClick={guardarRico} disabled={guardandoRico || cargando}>{guardandoRico ? "Guardando…" : "Guardar datos y ejemplos"}</Button>
          </div>
        </CardContent></Card>

        {/* 4) Modelo (solo lectura) */}
        <Card className="mt-3"><CardContent className="pt-5">
          <div className="text-[13px] flex items-center gap-2 flex-wrap">
            <Icon name="cpu" className="text-muted-foreground" />
            <span className="text-muted-foreground">Modelo que usa tu espacio:</span>
            <code className="font-mono text-[12px] px-2 py-0.5 rounded bg-secondary">{cargando ? "…" : (modelo || "el modelo por defecto de la plataforma")}</code>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">El modelo lo administra la plataforma (control de costo). Si necesitas otro, pídelo a soporte.</p>
        </CardContent></Card>
      </div>
    </main>
  );
}
