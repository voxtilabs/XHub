"use client";
import { Icon } from "@/components/icon";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type IA = { contexto: string | null; modelo: string | null };

export default function AjustesIA() {
  const [contexto, setContexto] = useState("");
  const [modelo, setModelo] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    apiFetch<IA>("/cliente/ia")
      .then((d) => { setContexto(d.contexto ?? ""); setOriginal(d.contexto ?? ""); setModelo(d.modelo); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setCargando(false));
  }, []);

  async function guardar() {
    setError(null); setGuardando(true);
    try {
      const r = await apiFetch<{ contexto: string | null }>("/cliente/ia", { method: "PUT", body: JSON.stringify({ contexto }) });
      setOriginal(r.contexto ?? ""); setMsg("Contexto guardado"); setTimeout(() => setMsg(null), 2400);
    } catch (e) { setError((e as Error).message); } finally { setGuardando(false); }
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

        <Card><CardContent className="pt-5">
          <label className="block">
            <span className="text-[14px] font-semibold">Contexto para la IA <span className="text-muted-foreground font-normal">(rubro, tono, datos del cliente)</span></span>
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              disabled={cargando}
              rows={7}
              maxLength={4000}
              placeholder="Ej.: Somos una inmobiliaria en Santiago. Tono cercano y formal. No prometas fechas de entrega. Los reclamos por postventa se derivan al área de mantención."
              className="mt-2 w-full rounded-md border border-border bg-secondary/40 p-3 text-[13px] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </label>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-muted-foreground">{contexto.length}/4000 · Se antepone a los prompts de resumen y sugerencia de este cliente.</span>
            <Button size="sm" onClick={guardar} disabled={guardando || !sucio}>{guardando ? "Guardando…" : "Guardar contexto"}</Button>
          </div>
        </CardContent></Card>

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
