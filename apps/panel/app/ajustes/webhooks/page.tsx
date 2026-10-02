"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { HeroFeatures } from "@/components/hero-features";

type Wh = { id: string; url: string; eventos: string[]; activo: boolean; creado_en: string };
type Entrega = { id: string; evento: string; url: string; estado: string; ultimo_codigo: number | null; intentos: number; proxima_en?: string; creado_en: string };
type Data = { datos: Wh[]; entregas: Entrega[]; eventosDisponibles: string[] };
const FILTROS = [["", "Todas"], ["pendiente", "Pendientes"], ["entregado", "Entregadas"], ["fallido", "Fallidas"]] as const;
const fecha = (s: string) => { try { return new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };
const estadoEntrega = (e: string) => ({ entregado: "Entregada", fallido: "Fallida", pendiente: "Pendiente" }[e] ?? e);

export default function Webhooks() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [url, setUrl] = useState("");
  const [evs, setEvs] = useState<string[]>([]);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [ents, setEnts] = useState<Entrega[]>([]);
  const [filtro, setFiltro] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);
  const [cargandoEnt, setCargandoEnt] = useState(true);
  const [errorEnt, setErrorEnt] = useState<string | null>(null);
  const solicitudEnt = useRef(0);
  const filtroActual = useRef("");

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setD(await apiFetch<Data>("/cliente/webhooks")); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);

  const cargarEnt = useCallback(async (estado: string, cursor?: string) => {
    const solicitud = ++solicitudEnt.current;
    setCargandoEnt(true); setErrorEnt(null);
    if (!cursor) { setEnts([]); setSig(null); }
    try {
      const qs = new URLSearchParams(); if (estado) qs.set("estado", estado); if (cursor) qs.set("cursor", cursor);
      const r = await apiFetch<{ datos: Entrega[]; siguiente: string | null }>(`/cliente/webhooks/entregas?${qs}`);
      if (solicitud !== solicitudEnt.current) return;
      setEnts((prev) => cursor ? [...prev, ...r.datos] : r.datos); setSig(r.siguiente);
    } catch (e) { if (solicitud === solicitudEnt.current) setErrorEnt((e as Error).message); }
    finally { if (solicitud === solicitudEnt.current) setCargandoEnt(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { filtroActual.current = filtro; cargarEnt(filtro); }, [filtro, cargarEnt]);

  async function reintentar(id: string) {
    setReintentando(id); setError(null);
    try { await apiFetch(`/cliente/webhooks/entregas/${id}/reintentar`, { method: "POST" }); await cargarEnt(filtroActual.current); }
    catch (e) { setError((e as Error).message); } finally { setReintentando(null); }
  }

  async function crear() {
    if (!/^https:\/\//.test(url)) { setError("La URL debe empezar con https://"); return; }
    setError(null);
    try { const r = await apiFetch<{ secreto: string }>("/cliente/webhooks", { method: "POST", body: JSON.stringify({ url, eventos: evs }) }); setSecreto(r.secreto); setUrl(""); setEvs([]); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function toggle(w: Wh) { try { await apiFetch(`/cliente/webhooks/${w.id}`, { method: "PUT", body: JSON.stringify({ activo: !w.activo }) }); await cargar(); } catch (e) { setError((e as Error).message); } }
  async function borrar(w: Wh) { try { await apiFetch(`/cliente/webhooks/${w.id}`, { method: "DELETE" }); await cargar(); } catch (e) { setError((e as Error).message); } }

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-webhooks-page">
        <div className="xhub-page-heading" data-hero="integration">
          <div><div className="xhub-eyebrow">INTEGRACIONES · AUTOMATIZACIÓN</div><h1>Webhooks</h1><p>Tu operación conectada. Cada evento llega a donde lo necesitas.</p><HeroFeatures variant="webhooks" />
          </div>
        </div>
        <p className="xhub-platform-description"><Icon name="shield-check" weight="regular" /><span>Recibe eventos de xHub en tu sistema con firma por webhook y reintentos exponenciales. Solo HTTPS; los destinos internos están bloqueados.</span></p>

        {error && <div role="alert" className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}
        {secreto && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", border: "1px solid hsl(var(--exito)/0.35)" }}>
          <div className="font-medium mb-1" style={{ color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" weight="regular" /> Webhook creado. Guarda el secreto — se muestra una sola vez:</div>
          <code className="block font-mono text-[12px] break-all p-2 rounded bg-secondary">{secreto}</code>
        </div>}

        {/* Crear */}
        <Card className="xhub-webhooks-create"><CardContent className="xhub-webhooks-form">
          <h2 className="xhub-section-heading"><Icon name="webhooks-logo" weight="regular" /> Nuevo webhook</h2>
          <div className="xhub-webhooks-field">
            <label htmlFor="webhook-url" className="xhub-platform-field-label">URL de destino</label>
            <Input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-sistema.cl/hooks/xhub" />
          </div>
          <fieldset className="xhub-webhooks-field">
          <legend className="xhub-platform-field-label">Eventos que quieres recibir</legend>
          <div className="xhub-event-options">
            {(d?.eventosDisponibles ?? []).map((ev) => {
              const on = evs.includes(ev);
              return <button key={ev} aria-pressed={on} onClick={() => setEvs((s) => on ? s.filter((x) => x !== ev) : [...s, ev])}
                className={"px-2.5 h-7 rounded-pill text-[12px] font-mono border " + (on ? "bg-[hsl(var(--senal)/0.15)] border-[hsl(var(--senal)/0.5)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{ev}</button>;
            })}
          </div>
          </fieldset>
          <div className="xhub-webhooks-form-actions"><Button size="sm" onClick={crear} disabled={!url || evs.length === 0}><Icon name="plus" /> Crear webhook</Button></div>
        </CardContent></Card>

        {/* Endpoints */}
        <section className="xhub-webhooks-section xhub-endpoint-section" aria-labelledby="webhooks-endpoints-title">
        <div className="xhub-webhooks-section-head">
          <div><h2 id="webhooks-endpoints-title" className="xhub-section-heading"><Icon name="plugs-connected" weight="regular" /> Endpoints <span className="xhub-platform-count">{d?.datos.length ?? 0}</span></h2><p className="xhub-webhooks-section-caption">Los destinos que conectan xHub con tus sistemas.</p></div>
        </div>
        {cargando && !d ? <div role="status" className="xhub-webhooks-loading"><Icon name="spinner-gap" />Cargando endpoints…</div> : !d ? null : d.datos.length === 0 ? <Card><CardContent className="xhub-webhooks-empty"><Icon name="webhooks-logo" /><h3>Sin endpoints todavía</h3><p>Crea un webhook para empezar a enviar eventos a tu sistema.</p></CardContent></Card> : (
          <div className="xhub-webhooks-endpoints">
            {d.datos.map((w) => (
              <Card key={w.id} className="xhub-webhook-endpoint" data-active={w.activo}><CardContent className="xhub-webhook-row">
                <div className="xhub-webhook-destination">
                  <Icon name="webhooks-logo" weight="regular" />
                  <div className="xhub-webhook-identity"><span className="xhub-webhook-eyebrow">Destino del webhook</span><h3><code>{w.url}</code></h3></div>
                </div>
                <div className="xhub-webhook-meta"><span className="xhub-endpoint-status" data-active={w.activo}><Icon name={w.activo ? "check-circle" : "circle"} weight={w.activo ? "regular" : "fill"} />{w.activo ? "Activo" : "Pausado"}</span><time dateTime={w.creado_en}>Creado {fecha(w.creado_en)}</time></div>
                <div className="xhub-webhook-footer">
                  <div className="xhub-webhook-subscriptions"><span>{w.eventos.length} {w.eventos.length === 1 ? "evento suscrito" : "eventos suscritos"}</span><div className="xhub-webhook-events">{w.eventos.map((e) => <span key={e}>{e}</span>)}</div></div>
                  <div className="xhub-webhook-actions"><button className="xhub-webhook-toggle" onClick={() => toggle(w)}><Icon name={w.activo ? "circle" : "check-circle"} weight="regular" />{w.activo ? "Pausar" : "Activar"}</button><button className="xhub-webhook-delete" onClick={() => borrar(w)}><Icon name="x" />Eliminar</button></div>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
        </section>

        {/* Entregas */}
        <section className="xhub-webhooks-section xhub-webhooks-deliveries" aria-labelledby="webhooks-deliveries-title">
        <div className="xhub-webhooks-section-head">
          <div><h2 id="webhooks-deliveries-title" className="xhub-section-heading"><Icon name="clock-counter-clockwise" weight="regular" /> Entregas</h2><p className="xhub-webhooks-section-caption">El recorrido de tus eventos, envío a envío.</p></div>
          <div className="xhub-webhooks-filters" role="group" aria-label="Filtrar entregas">
            {FILTROS.map(([val, lbl]) => (
              <button key={val} aria-pressed={filtro === val} onClick={() => setFiltro(val)}
                className="xhub-delivery-filter"><Icon name={val === "" ? "stack" : val === "pendiente" ? "clock" : val === "entregado" ? "check-circle" : "warning-circle"} weight={filtro === val ? "fill" : "regular"} />{lbl}</button>
            ))}
          </div>
        </div>
        <div className="xhub-delivery-summary"><span><Icon name="broadcast" />Historial de envíos</span><span aria-live="polite">{cargandoEnt ? "Cargando…" : `${ents.length} ${ents.length === 1 ? "entrega" : "entregas"} en esta vista`}</span></div>
        <div className="xhub-delivery-content" aria-busy={cargandoEnt}>
          {errorEnt && <div role="alert" className="xhub-delivery-error"><Icon name="warning-circle" />{errorEnt}</div>}
          {ents.length === 0 ? (cargandoEnt ? <div role="status" className="xhub-webhooks-loading"><Icon name="spinner-gap" />Cargando entregas…</div> : !errorEnt && <div className="xhub-webhooks-empty"><Icon name={filtro === "fallido" ? "warning-circle" : filtro === "entregado" ? "check-circle" : "clock-counter-clockwise"} /><h3>{filtro ? `Sin entregas ${FILTROS.find(([val]) => val === filtro)?.[1].toLowerCase()}` : "Sin entregas todavía"}</h3><p>{filtro ? "Los envíos con este estado aparecerán aquí." : "Aquí podrás seguir los eventos enviados a tus endpoints."}</p></div>) : (
            <table className="xhub-delivery-table" role="table">
              <caption className="sr-only">Entregas de webhooks: evento, destino, estado, último código HTTP, intentos y fecha de creación.</caption>
              <colgroup><col className="xhub-delivery-col-event" /><col className="xhub-delivery-col-state" /><col className="xhub-delivery-col-http" /><col className="xhub-delivery-col-attempts" /><col className="xhub-delivery-col-date" /><col className="xhub-delivery-col-action" /></colgroup>
              <thead><tr><th scope="col">Evento y destino</th><th scope="col">Estado</th><th scope="col">Último HTTP</th><th scope="col">Intentos</th><th scope="col">Creada</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>{ents.map((e) => (
                <tr key={e.id} data-status={e.estado}>
                  <td data-label="Evento y destino" className="xhub-delivery-event"><div><Icon name="webhooks-logo" weight="regular" /><code>{e.evento}</code></div><span>{e.url}</span></td>
                  <td data-label="Estado"><span className="xhub-delivery-status" data-status={e.estado}><Icon name={e.estado === "entregado" ? "check-circle" : e.estado === "fallido" ? "warning-circle" : "clock"} weight="regular" />{estadoEntrega(e.estado)}</span></td>
                  <td data-label="Último HTTP" className="xhub-delivery-http"><span title={e.ultimo_codigo === null ? "Sin respuesta HTTP registrada" : `HTTP ${e.ultimo_codigo}`}>{e.ultimo_codigo ?? "—"}</span></td>
                  <td data-label="Intentos" className="xhub-delivery-attempts">{e.intentos}</td>
                  <td data-label="Creada" className="xhub-delivery-date"><time dateTime={e.creado_en}>{fecha(e.creado_en)}</time>{e.estado === "pendiente" && e.proxima_en && <span>Próximo intento programado: {fecha(e.proxima_en)}</span>}</td>
                  <td data-label="Acciones" className="xhub-delivery-action">{e.estado === "fallido" && <button onClick={() => reintentar(e.id)} disabled={reintentando !== null}><Icon name={reintentando === e.id ? "spinner-gap" : "arrows-clockwise"} />{reintentando === e.id ? "Reintentando…" : "Reintentar"}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {sig && <div className="xhub-delivery-pagination"><Button size="sm" variant="outline" disabled={cargandoEnt} onClick={() => cargarEnt(filtro, sig)}>{cargandoEnt ? "Cargando…" : "Cargar más"}<Icon name="arrow-down" /></Button></div>}
        </div>
        </section>
        {cargando && <div className="text-xs text-muted-foreground font-mono mt-3">Cargando…</div>}
      </div>
    </main>
  );
}
