"use client";
import { Icon } from "@/components/icon";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { apiFetch, apiDocsUrl, apiV1Base } from "@/lib/api";
import { HeroFeatures } from "@/components/hero-features";

type Scope = { scope: string; modulo: string; descripcion: string };
type Llave = { id: string; nombre: string; prefijo: string; scopes: string[]; creada_en: string; ultimo_uso: string | null; revocada_en: string | null };
type Consumo = { dia: string; total: number; porRuta: Record<string, number>; cuotaMensual: number };
const gruposDeAlcances: Record<string, { titulo: string; detalle: string; icono: string }> = {
  nucleo: { titulo: "Personas", detalle: "Identidad y datos de tus clientes", icono: "identification-card" },
  tickets: { titulo: "Tickets", detalle: "Conversaciones y atención", icono: "chats-circle" },
  crm: { titulo: "CRM", detalle: "Relaciones y oportunidades", icono: "kanban" },
};
const nombresDeAlcances: Record<string, string> = {
  "nucleo.leer": "Consultar personas", "nucleo.escribir": "Registrar personas", "nucleo.administrar": "Suprimir datos",
  "tickets.leer": "Consultar tickets", "tickets.crear": "Crear tickets", "tickets.responder": "Estado y sugerencias", "tickets.asignar": "Asignar tickets",
  "crm.leer": "Consultar CRM", "crm.escribir": "Actualizar CRM",
};
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
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [base, setBase] = useState("");
  const [docsHref, setDocsHref] = useState("/docs");

  useEffect(() => {
    setBase(apiV1Base());
    setDocsHref(apiDocsUrl());
  }, []);

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
  // Confirmación INLINE (sin confirm() nativo: algunos navegadores lo bloquean y el
  // botón "no hacía nada"). Primer clic pide confirmar; el segundo revoca.
  async function revocar(k: Llave) {
    setError(null); setConfirmar(null);
    try { await apiFetch(`/cliente/llaves/${k.id}`, { method: "DELETE" }); await cargar(); flash("Llave revocada"); }
    catch (e) { setError((e as Error).message); }
  }
  async function guardarScopes(k: Llave, nuevos: string[]) {
    setError(null);
    try { await apiFetch(`/cliente/llaves/${k.id}/scopes`, { method: "PUT", body: JSON.stringify({ scopes: nuevos }) }); await cargar(); flash("Scopes actualizados"); setEditando(null); }
    catch (e) { setError((e as Error).message); }
  }
  const toggleSel = (s: string) => setSel((xs) => xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]);

  const curl = `curl ${base}/crm/oportunidades \\\n  -H "Authorization: Bearer xhub_TU_LLAVE"`;
  const pct = consumo && consumo.cuotaMensual > 0 ? Math.min(100, Math.round(consumo.total / consumo.cuotaMensual * 100)) : 0;
  const activas = llaves.filter((k) => !k.revocada_en);
  const revocadas = llaves.filter((k) => k.revocada_en);
  const grupos = scopes.reduce<Record<string, Scope[]>>((resultado, alcance) => {
    (resultado[alcance.modulo] ??= []).push(alcance);
    return resultado;
  }, {});

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-developer-page">
        <div className="xhub-page-heading" data-hero="integration" data-hero-size="long">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DEL ESPACIO</div>
            <h1>Desarrolladores</h1>
            <p>Tu API, tus llaves, tu consumo y tus webhooks en un solo lugar.</p>
          <HeroFeatures variant="desarrollo" />
          </div>
          <Button asChild size="sm" variant="outline"><a href={docsHref} target="_blank" rel="noreferrer"><Icon name="arrow-up-right" /> Documentación</a></Button>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> {msg}</div>}

        {/* Referencia */}
        <h2 className="xhub-section-heading"><Icon name="plugs-connected" weight="regular" /> Tu API</h2>
        <Card className="xhub-api-reference mb-4"><CardContent className="pt-5">
          <div className="text-[13px] text-muted-foreground mb-2">Base de la API pública. Autentícate con una llave <code className="font-mono">xhub_…</code> en la cabecera <code className="font-mono">Authorization: Bearer</code>.</div>
          <div className="flex items-center gap-2 mb-3">
            <code className="font-mono text-[13px] px-2.5 py-1.5 rounded bg-secondary flex-1 truncate">{base || "…"}</code>
            <button onClick={() => copiar(base, "base")} className="text-[12px] text-[hsl(var(--senal))] hover:underline">{copiado === "base" ? <>copiado <Icon name="check" className="xhub-inline-icon" /></> : "copiar"}</button>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Ejemplo</div>
          <pre className="font-mono text-[12px] p-3 rounded bg-secondary overflow-x-auto whitespace-pre">{curl}</pre>
        </CardContent></Card>

        {/* Consumo */}
        <h2 className="xhub-section-heading"><Icon name="gauge" weight="regular" /> Consumo de hoy</h2>
        <Card className="xhub-api-consumption mb-4"><CardContent className="pt-5">
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
        <h2 className="xhub-section-heading"><Icon name="key" weight="regular" /> Llaves de API</h2>
        {tokenNuevo && (
          <div className="mb-3 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--senal)/0.1)", border: "1px solid hsl(var(--senal)/0.35)" }}>
            <div className="font-medium mb-1"><Icon name="check" className="xhub-inline-icon" /> Llave creada. Cópiala ahora — no se vuelve a mostrar:</div>
            <div className="flex items-center gap-2"><code className="block font-mono text-[12px] break-all p-2 rounded bg-secondary flex-1">{tokenNuevo}</code>
              <button onClick={() => copiar(tokenNuevo, "token")} className="text-[12px] text-[hsl(var(--senal))] hover:underline whitespace-nowrap">{copiado === "token" ? <>copiado <Icon name="check" className="xhub-inline-icon" /></> : "copiar"}</button></div>
            <button onClick={() => setTokenNuevo(null)} className="text-[11px] text-muted-foreground mt-1 hover:text-foreground">ya la guardé</button>
          </div>
        )}

        {/* Crear llave */}
        <Card className="xhub-key-studio mb-4"><CardContent className="xhub-key-studio-content">
          <div className="xhub-key-intro">
            <div className="xhub-key-intro-copy">
              <span className="xhub-key-eyebrow"><Icon name="plugs-connected" weight="regular" /> CONECTA TU ESPACIO</span>
              <h3>Nueva llave<span>.</span></h3>
              <p>Una conexión a tu medida. Dale un nombre y define a qué puede acceder.</p>
            </div>
            <div className="xhub-key-art" aria-hidden="true"><span /><Icon name="key" weight="duotone" /><i /><i /></div>
            <div className="xhub-key-name">
              <label htmlFor="api-key-name">Nombre de la llave</label>
              <Input id="api-key-name" aria-label="Nombre de la llave" aria-describedby="api-key-name-hint" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="P. ej. Integración ERP" />
              <p id="api-key-name-hint">Un nombre que te ayude a reconocer esta conexión.</p>
            </div>
          </div>

          <div className="xhub-key-permissions" aria-describedby="api-key-inheritance">
            <div className="xhub-key-permissions-heading">
              <div><h4><Icon name="sliders-horizontal" weight="regular" /> Alcances de la llave</h4><p>Personaliza los permisos disponibles en tu plan.</p></div>
              <span className="xhub-key-selection" role="status">{sel.length === 0 ? "Acceso heredado del plan" : `${sel.length} ${sel.length === 1 ? "alcance seleccionado" : "alcances seleccionados"}`}</span>
            </div>
            <p id="api-key-inheritance" className="xhub-key-inheritance"><Icon name="info" weight="regular" /> Sin alcances marcados, la llave hereda todos los de tu plan.</p>
            {scopes.length === 0 && <div className="xhub-key-loading" role="status">Cargando alcances…</div>}
            <div className="xhub-key-scope-grid">
              {Object.entries(grupos).map(([modulo, disponibles]) => {
                const grupo = gruposDeAlcances[modulo] ?? { titulo: modulo, detalle: "Permisos de este módulo", icono: "squares-four" };
                const seleccionados = disponibles.filter((s) => sel.includes(s.scope)).length;
                return <section className="xhub-key-scope-group" key={modulo} aria-label={`Alcances de ${grupo.titulo}`}>
                  <header className="xhub-key-group-heading">
                    <Icon name={grupo.icono} weight="regular" />
                    <div><h5>{grupo.titulo}</h5><p>{grupo.detalle}</p></div>
                    <span aria-label={`${seleccionados} de ${disponibles.length} alcances seleccionados`} data-selected={seleccionados > 0}>{seleccionados}<span>/{disponibles.length}</span></span>
                  </header>
                  <div className="xhub-key-scope-options">
                    {disponibles.map((s) => {
                      const on = sel.includes(s.scope);
                      return <button key={s.scope} type="button" role="switch" aria-checked={on} aria-labelledby={`scope-label-${s.scope}`} aria-describedby={`scope-description-${s.scope}`} onClick={() => toggleSel(s.scope)} className="xhub-key-scope-option">
                        <span className="xhub-key-scope-title" id={`scope-label-${s.scope}`}>{nombresDeAlcances[s.scope] ?? s.scope}<code>{s.scope}</code></span>
                        <span className="xhub-key-switch" aria-hidden="true"><span><Icon name="check" /></span></span>
                        <span className="xhub-key-scope-description" id={`scope-description-${s.scope}`}>{s.descripcion}</span>
                      </button>;
                    })}
                  </div>
                </section>;
              })}
            </div>
          </div>
          <div className="xhub-key-create-footer">
            <div className="xhub-key-access-summary"><Icon name="shield-check" weight="regular" /><div><strong>{sel.length === 0 ? "Todos los alcances de tu plan" : "Acceso personalizado"}</strong><p>{sel.length === 0 ? "La llave utilizará los permisos que incluye tu plan." : `La llave tendrá ${sel.length === 1 ? "el alcance seleccionado" : `los ${sel.length} alcances seleccionados`}.`}</p></div></div>
            <Button size="sm" onClick={crear} disabled={creando || !nombre.trim()}><Icon name="key" weight="regular" />{creando ? "Creando…" : "Crear llave"}<Icon name="arrow-right" /></Button>
          </div>
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
                  <button type="button" onClick={() => setEditando(editando === k.id ? null : k.id)} className="text-[12px] text-[hsl(var(--senal))] hover:underline">scopes</button>
                  {confirmar === k.id ? (
                    <span className="text-[12px] flex items-center gap-2">
                      <span className="text-muted-foreground">¿Revocar?</span>
                      <button type="button" onClick={() => revocar(k)} className="text-[hsl(var(--critico))] font-semibold hover:underline">Sí, revocar</button>
                      <button type="button" onClick={() => setConfirmar(null)} className="text-muted-foreground hover:underline">no</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmar(k.id)} className="text-[12px] text-muted-foreground hover:text-[hsl(var(--critico))]">revocar</button>
                  )}
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
          <Button asChild size="sm" variant="outline"><Link href="/ajustes/webhooks"><Icon name="webhooks-logo" /> Configurar webhooks</Link></Button>
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
