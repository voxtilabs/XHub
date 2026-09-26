"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Espejo del esquema Zod del API (apps/api/src/esquemas.ts → crearTicket).
type Canal = "telefono" | "email" | "rut" | "xcontact" | "webchat" | "instagram" | "messenger";
type Pri = "baja" | "media" | "alta" | "urgente";
const CANALES: { v: Canal; etiqueta: string; hint: string }[] = [
  { v: "telefono", etiqueta: "Teléfono", hint: "+56 9 1234 5678" },
  { v: "email", etiqueta: "Email", hint: "juan@empresa.cl" },
  { v: "rut", etiqueta: "RUT", hint: "12.345.678-5" },
  { v: "xcontact", etiqueta: "XContact", hint: "contacto 8842" },
  { v: "webchat", etiqueta: "Webchat", hint: "id de sesión" },
  { v: "instagram", etiqueta: "Instagram", hint: "@usuario" },
  { v: "messenger", etiqueta: "Messenger", hint: "id de Messenger" },
];
const PRIS: { v: Pri; rol: "senal" | "aviso" | "critico" }[] = [
  { v: "baja", rol: "senal" }, { v: "media", rol: "senal" }, { v: "alta", rol: "aviso" }, { v: "urgente", rol: "critico" },
];

function leer(k: string, def: string) {
  try { return localStorage.getItem(k) ?? def; } catch { return def; }
}

export default function NuevoTicket() {
  const [canal, setCanal] = useState<Canal>("email");
  const [identidad, setIdentidad] = useState("");
  const [asunto, setAsunto] = useState("");
  const [prioridad, setPrioridad] = useState<Pri>("media");
  const [cuerpo, setCuerpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<{ numero: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // validación cliente = misma que rechazaría el API (falla temprano, mejor UX)
  const errores: Partial<Record<"identidad" | "asunto" | "cuerpo", string>> = {};
  if (identidad.trim().length < 1) errores.identidad = "Requerido";
  else if (identidad.length > 200) errores.identidad = "Máximo 200 caracteres";
  if (asunto.trim().length < 1) errores.asunto = "Requerido";
  else if (asunto.length > 300) errores.asunto = "Máximo 300 caracteres";
  if (cuerpo.length > 5000) errores.cuerpo = "Máximo 5000 caracteres";
  const valido = Object.keys(errores).length === 0;

  const hintCanal = CANALES.find((c) => c.v === canal)!.hint;

  async function enviar() {
    if (!valido || enviando) return;
    setEnviando(true); setErr(null); setOk(null);
    const base = leer("xhub_api_base", "");
    const key = leer("xhub_api_key", "");
    const body: Record<string, unknown> = { canal, identidad: identidad.trim(), asunto: asunto.trim(), prioridad };
    if (cuerpo.trim()) body.cuerpo = cuerpo.trim();
    try {
      if (!base || !key) throw new Error("Falta configurar el API del cliente (llave y dominio) en Ajustes.");
      const r = await fetch(`${base.replace(/\/$/, "")}/v1/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error?.mensaje ?? data?.mensaje ?? `El API respondió ${r.status}`);
      setOk({ numero: String(data.numero ?? data?.ticket?.numero ?? "—") });
      setIdentidad(""); setAsunto(""); setCuerpo("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const campo = "w-full rounded-md border bg-secondary px-3 h-11 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <main className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3 px-4 sm:px-7 py-4 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" style={{ boxShadow: "0 0 10px hsl(var(--primary))" }} />
        <span className="font-semibold text-lg tracking-tight">xTickets</span>
        <span className="text-[10px] font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5">Consola X5</span>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-7">
        <button onClick={() => (location.href = "/tickets")} className="text-sm text-muted-foreground hover:text-foreground mb-4">← Bandeja</button>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Nuevo ticket</h1>
        <p className="text-muted-foreground text-sm mb-6">Alta manual — el camino directo, sin pasar por el triage de IA. Se crea la persona si no existe y queda en su línea de tiempo.</p>

        {ok ? (
          <Card>
            <div className="p-6 flex flex-col items-start gap-3">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--exito))", boxShadow: "0 0 8px hsl(var(--exito))" }} />
                <span className="font-semibold">Ticket #{ok.numero} creado</span></div>
              <p className="text-sm text-muted-foreground">Ya aparece en la bandeja y en la ficha 360 de la persona.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => (location.href = "/tickets")}>Ir a la bandeja</Button>
                <Button size="sm" variant="secondary" onClick={() => setOk(null)}>Crear otro</Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="p-6 flex flex-col gap-5">
              {/* Canal */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Canal de origen</label>
                <select value={canal} onChange={(e) => setCanal(e.target.value as Canal)} className={campo + " mt-1.5"} style={{ borderColor: "hsl(var(--border))" }}>
                  {CANALES.map((c) => <option key={c.v} value={c.v}>{c.etiqueta}</option>)}
                </select>
              </div>

              {/* Identidad */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Identidad del canal</label>
                <Input value={identidad} onChange={(e) => setIdentidad(e.target.value)} placeholder={hintCanal} className="mt-1.5" maxLength={200} />
                <div className="flex justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground">El teléfono no es la llave: es la identidad del canal por el que llegó.</span>
                  {errores.identidad && <span className="text-[11px] text-[hsl(var(--critico))]">{errores.identidad}</span>}
                </div>
              </div>

              {/* Asunto */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Asunto</label>
                <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Resumen del problema" className="mt-1.5" maxLength={300} />
                {errores.asunto && <div className="text-[11px] text-[hsl(var(--critico))] mt-1">{errores.asunto}</div>}
              </div>

              {/* Prioridad */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Prioridad</label>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {PRIS.map((p) => (
                    <button key={p.v} onClick={() => setPrioridad(p.v)}
                      className={"px-3 h-9 rounded-pill text-[13px] font-medium border capitalize " + (prioridad === p.v ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                      {prioridad === p.v && <Badge rol={p.rol} className="mr-1.5 px-1 py-0">●</Badge>}{p.v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuerpo */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Primer mensaje <span className="text-muted-foreground/60 normal-case font-medium">(opcional)</span></label>
                <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={4} maxLength={5000}
                  placeholder="Lo que dijo la persona. Si lo pegas, se analiza la urgencia (enojo, SERNAC, legal…) y puede escalar la prioridad sola."
                  className={campo.replace("h-11", "py-2.5") + " mt-1.5 resize-y"} style={{ borderColor: "hsl(var(--border))" }} />
                {errores.cuerpo && <div className="text-[11px] text-[hsl(var(--critico))] mt-1">{errores.cuerpo}</div>}
              </div>

              {err && (
                <div className="flex gap-2 items-start p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>
                  <span>▲</span><span>{err}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Button onClick={enviar} disabled={!valido || enviando}>{enviando ? "Creando…" : "Crear ticket"}</Button>
                <span className="text-[11px] text-muted-foreground font-mono">POST /v1/tickets · scope tickets.crear</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
