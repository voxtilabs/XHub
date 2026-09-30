"use client";
import { Icon } from "@/components/icon";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { apiFetch, apiDocsUrl, apiV1Base } from "@/lib/api";

type Scope = { scope: string; modulo: string; descripcion: string };
type Llave = { id: string; nombre: string; prefijo: string; scopes: string[]; creada_en: string; ultimo_uso: string | null; revocada_en: string | null };
type Consumo = { dia: string; total: number; porRuta: Record<string, number>; cuotaMensual: number };
const fecha = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };

export default function Desarrollo() {
  const [llaves, setLlaves] = useState<Llave[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [consumo, setConsumo] = useState<Consumo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2400); };
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [k, c] = await Promise.all([
        apiFetch<{ datos: Llave[]; scopesDisponibles: Scope[] }>("/cliente/llaves"),
        apiFetch<Consumo>("/cliente/consumo").catch(() => null),
      ]);
      setLlaves(k.datos); setScopes(k.scopesDisponibles); if (c) setConsumo(c);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const copiar = (txt: string, cual: string) => { navigator.clipboard?.writeText(txt).then(() => { setCopiado(cual); setTimeout(() => setCopiado(null), 1500); }); };

  async function crear() {
    if (!nombre.trim()) { setError("Ponle un nombre a la llave"); return; }
    setError(null); setCreando(true);
    try {
      const r = await apiFetch<{ token: string }>("/cliente/llaves", { method: "POST", body: JSON.stringify({ nombre: nombre.trim(), scopes: sel }) });
      setTokenNuevo(r.token); setNombre(""); setSel([]); await cargar(); flash("Llave creada");
    } catch (e) { setError((e as Error).message); } finally { setCreando(false); }
  }
  async function revocar(k: Llave) {
    if (!confirm(`¿Revocar la llave «${k.nombre}»? Dejará de funcionar de inmediato.`)) return;
    setError(null);
    try { await apiFetch(`/cliente/llaves/${k.id}`, { method: "DELETE" }); await cargar(); flash("Llave revocada"); }
    catch (e) { setError((e as Error).message); }
  }
  async function guardarScopes(k: Llave, nuevos: string[]) {
    setError(null);
    try { await apiFetch(`/cliente/llaves/${k.id}/scopes`, { method: "PUT", body: JSON.stringify({ scopes: nuevos }) }); await cargar(); flash("Scopes actualizados"); setEditando(null); }
    catch (e) { setError((e as Error).message); }
  }
  const toggleSel = (s: string) => setSel((xs) => xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]);

  const base = typeof window !== "undefined" ? apiV1Base() : "";
  const curl = `curl ${base}/crm/oportunidades \\\n  -H "Authorization: Bearer xhub_TU_LLAVE"`;
  const pct = consumo && consumo.cuotaMensual > 0 ? Math.min(100, Math.round(consumo.total / consumo.cuotaMensual * 100)) : 0;
  const activas = llaves.filter((k) => !k.revocada_en);
  const revocadas = llaves.filter((k) => k.revocada_en);

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page">
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DEL ESPACIO</div>
            <h1>Desarrolladores</h1>
            <p>Tu API, tus llaves, tu consumo y tus webhooks en un solo lugar.</p>
          </div>
          <Button asChild size="sm" variant="outline"><a href={apiDocsUrl()} target="_blank" rel="noreferrer"><Icon name="arrow-up-right" /> Documentación</a></Button>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> {msg}</div>}

        {/* Referencia */}
        <h2 className="xhub-section-heading">Tu API</h2>
        <Card className="mb-4"><CardContent className="pt-5">
          <div className="text-[13px] text-muted-foreground mb-2">Base de la API pública. Autentícate con una llave <code className="font-mono">xhub_…</code> en la cabecera <code className="font-mono">Authorization: Bearer</code>.</div>
          <div className="flex items-center gap-2 mb-3">
            <code className="font-mono text-[13px] px-2.5 py-1.5 rounded bg-secondary flex-1 truncate">{base || "…"}</code>
            <button onClick={() => copiar(base, "base")} className="text-[12px] text-[hsl(var(--senal))] hover:underline">{copiado === "base" ? "copiado ✓" : "copiar"}</button>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Ejemplo</div>
          <pre className="font-mono text-[12px] p-3 rounded bg-secondary overflow-x-auto whitespace-pre">{curl}</pre>
        </CardContent></Card>

        {/* Consumo */}
        <h2 className="xhub-section-heading">Consumo de hoy</h2>
        <Card className="mb-4"><CardContent className="pt-5">
          {!consumo ? <div className="text-[13px] text-muted-foreground">Sin datos de consumo aún.</div> : (
            <>
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-[15px] font-semibold">{consumo.total.toLocaleString("es-CL")} <span className="text-[13px] font-normal text-muted-foreground">llamadas hoy</span></div>
                <div className="text-[12px] text-muted-foreground">cuota mensual: {consumo.cuotaMensual.toLocaleString("es-CL")}</div>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden mb-1"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "hsl(var(--critico))" : pct > 70 ? "hsl(var(--aviso))" : "hsl(var(--exito))" }} /></div>
              <div className="text-[11px] text-muted-foreground mb-3">{pct}% de la cuota mensual (aprox., el consumo se cuenta por día hábil).</div>
              {Object.keys(consumo.porRuta).length > 0 && (
                <div className="flex flex-col gap-1">
                  {Object.entries(consumo.porRuta).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ruta, n]) => (
                    <div key={ruta} className="flex justify-between text-[12px]"><code className="font-mono text-muted-foreground truncate">{ruta}</code><span className="tabular-nums">{n}</span></div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent></Card>

        {/* Llaves */}
        <h2 className="xhub-section-heading">Llaves de API</h2>
        {tokenNuevo && (
          <div className="mb-3 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--senal)/0.1)", border: "1px solid hsl(var(--senal)/0.35)" }}>
            <div className="font-medium mb-1">✓ Llave creada. Cópiala ahora — no se vuelve a mostrar:</div>
            <div className="flex items-center gap-2"><code className="block font-mono text-[12px] break-all p-2 rounded bg-secondary flex-1">{tokenNuevo}</code>
              <button onClick={() => copiar(tokenNuevo, "token")} className="text-[12px] text-[hsl(var(--senal))] hover:underline whitespace-nowrap">{copiado === "token" ? "copiado ✓" : "copiar"}</button></div>
            <button onClick={() => setTokenNuevo(null)} className="text-[11px] text-muted-foreground mt-1 hover:text-foreground">ya la guardé</button>
          </div>
        )}

        {/* Crear llave */}
        <Card className="mb-4"><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Nueva llave</div>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (p. ej. Integración ERP)" className="mb-3" />
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Alcances (según tu plan)</div>
          <div className="flex flex-col gap-1 mb-3">
            {scopes.length === 0 && <div className="text-[12px] text-muted-foreground">Cargando alcances…</div>}
            {scopes.map((s) => {
              const on = sel.includes(s.scope);
              return (
                <button key={s.scope} type="button" role="switch" aria-checked={on} onClick={() => toggleSel(s.scope)}
                  className="flex items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/50 transition">
                  <span className={"h-5 w-9 rounded-full relative transition shrink-0 " + (on ? "bg-[hsl(var(--exito))]" : "bg-secondary border border-border")}>
                    <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " + (on ? "left-[18px]" : "left-0.5")} />
                  </span>
                  <span className="min-w-0"><span className="block text-[13px] font-mono">{s.scope}</span><span className="block text-[11px] text-muted-foreground">{s.descripcion}</span></span>
                </button>
              );
            })}
          </div>
          <Button size="sm" onClick={crear} disabled={creando || !nombre.trim()}>{creando ? "creando…" : "Crear llave"}</Button>
          <p className="text-[11px] text-muted-foreground mt-2">Sin alcances marcados, la llave hereda todos los de tu plan.</p>
        </CardContent></Card>

        {/* Lista de llaves */}
        {activas.length === 0 && <Card className="mb-2"><CardContent className="py-6 text-center text-muted-foreground text-sm">No tienes llaves activas.</CardContent></Card>}
        {activas.map((k) => (
          <Card key={k.id} className="mb-2"><CardContent className="py-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px]">{k.nombre}</div>
                <div className="font-mono text-[12px] text-muted-foreground">{k.prefijo}…</div>
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {k.scopes.length === 0 ? <span className="text-[11px] text-muted-foreground italic">todos los de tu plan</span> :
                    k.scopes.map((s) => <span key={s} className="rounded-pill bg-secondary px-1.5 text-[10px] font-mono">{s}</span>)}
                </div>
              </div>
              <div className="text-right text-[11px] text-muted-foreground whitespace-nowrap">
                <div>último uso: {fecha(k.ultimo_uso)}</div>
                <div className="mt-1.5 flex gap-3 justify-end">
                  <button onClick={() => setEditando(editando === k.id ? null : k.id)} className="text-[12px] text-[hsl(var(--senal))] hover:underline">scopes</button>
                  <button onClick={() => revocar(k)} className="text-[12px] text-muted-foreground hover:text-[hsl(var(--critico))]">revocar</button>
                </div>
              </div>
            </div>
            {editando === k.id && (
              <EditorScopes llave={k} scopes={scopes} onGuardar={(ns) => guardarScopes(k, ns)} onCancelar={() => setEditando(null)} />
            )}
          </CardContent></Card>
        ))}

        {revocadas.length > 0 && (
          <details className="mt-2"><summary className="text-[12px] text-muted-foreground cursor-pointer">Llaves revocadas ({revocadas.length})</summary>
            <div className="mt-2 flex flex-col gap-1">
              {revocadas.map((k) => <div key={k.id} className="text-[12px] text-muted-foreground flex justify-between px-2"><span>{k.nombre} · <code className="font-mono">{k.prefijo}…</code></span><span>revocada {fecha(k.revocada_en)}</span></div>)}
            </div>
          </details>
        )}

        {/* Webhooks */}
        <h2 className="xhub-section-heading mt-6">Webhooks</h2>
        <Card><CardContent className="pt-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-muted-foreground">Recibe eventos de xHub en tu sistema (tickets, personas, oportunidades) con firma y reintentos.</div>
          <Button asChild size="sm" variant="outline"><a href="/ajustes/webhooks"><Icon name="webhooks-logo" /> Configurar webhooks</a></Button>
        </CardContent></Card>
      </div>
    </main>
  );
}

function EditorScopes({ llave, scopes, onGuardar, onCancelar }: { llave: Llave; scopes: Scope[]; onGuardar: (s: string[]) => void; onCancelar: () => void }) {
  const [sel, setSel] = useState<string[]>(llave.scopes);
  const toggle = (s: string) => setSel((xs) => xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]);
  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Editar alcances</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {scopes.map((s) => {
          const on = sel.includes(s.scope);
          return <button key={s.scope} type="button" onClick={() => toggle(s.scope)}
            className={"px-2.5 h-7 rounded-pill text-[12px] font-mono border " + (on ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{s.scope}</button>;
        })}
      </div>
      <div className="flex gap-2"><Button size="sm" onClick={() => onGuardar(sel)}>Guardar</Button><Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button></div>
    </div>
  );
}
