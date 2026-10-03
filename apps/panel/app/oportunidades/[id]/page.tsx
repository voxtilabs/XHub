"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOportunidad, agregarActividad, marcarHecho, getProductos, getDealProductos, addDealProducto, quitarDealProducto, guardarEtiquetasDeal, getTicketsDeOportunidad, type OportunidadDetalle, type Producto, type DealProducto, type TicketDeOportunidad } from "@/lib/crm";

const TIPOS = [["nota", "Nota"], ["llamada", "Llamada"], ["reunion", "Reunión"], ["tarea", "Tarea"]] as const;
const icono: Record<string, string> = { nota: "note-pencil", llamada: "phone", reunion: "users", tarea: "check-circle" };
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
  const [catalogo, setCatalogo] = useState<Producto[]>([]);
  const [items, setItems] = useState<DealProducto[]>([]);
  const [pf, setPf] = useState({ productoId: "", nombre: "", cantidad: 1, precio: 0 });
  const [nuevaEtq, setNuevaEtq] = useState("");
  const [tickets, setTickets] = useState<TicketDeOportunidad[]>([]);

  const cargar = useCallback(async () => {
    setError(null);
    try { setO(await getOportunidad(id)); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);
  const cargarProd = useCallback(async () => { try { const [c, li] = await Promise.all([getProductos(), getDealProductos(id)]); setCatalogo(c.datos); setItems(li.datos); } catch { /* noop */ } }, [id]);
  useEffect(() => { cargarProd(); }, [cargarProd]);
  useEffect(() => { getTicketsDeOportunidad(id).then((r) => setTickets(r.datos)).catch(() => {}); }, [id]);

  const puede = o?.puede.gestionar ?? false;
  async function agregar() {
    if (!cuerpo.trim()) return;
    setEnviando(true);
    try { await agregarActividad(id, tipo, cuerpo.trim()); setCuerpo(""); await cargar(); }
    catch (e) { setError((e as Error).message); } finally { setEnviando(false); }
  }
  async function agregarItem() {
    const sel = catalogo.find((c) => c.id === pf.productoId);
    if (!pf.productoId && (!pf.nombre.trim())) return;
    try { await addDealProducto(id, { productoId: pf.productoId || undefined, nombre: pf.nombre.trim() || sel?.nombre, cantidad: Number(pf.cantidad), precio: Number(pf.precio) || sel?.precio }); setPf({ productoId: "", nombre: "", cantidad: 1, precio: 0 }); await cargarProd(); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function quitarItem(lid: string) { try { await quitarDealProducto(id, lid); await cargarProd(); await cargar(); } catch (e) { setError((e as Error).message); } }
  async function fijarEtiquetas(lista: string[]) { try { const r = await guardarEtiquetasDeal(id, lista); setO((prev) => prev && { ...prev, etiquetas: r.etiquetas }); } catch (e) { setError((e as Error).message); } }
  async function toggle(aid: string, hecho: boolean) {
    setO((prev) => prev && { ...prev, actividades: prev.actividades.map((a) => a.id === aid ? { ...a, hecho } : a) });
    try { await marcarHecho(id, aid, hecho); } catch (e) { setError((e as Error).message); cargar(); }
  }

  if (cargando) return <div className="xhub-page xhub-crm-page"><div className="crm-loading" role="status"><Icon name="spinner-gap" />Cargando oportunidad…</div></div>;
  if (!o) return <div className="xhub-page xhub-crm-page"><div className="text-[13px] text-[hsl(var(--critico))]"><Icon name="warning-circle" weight="regular" /> {error ?? "No encontrada"}</div><Link href="/oportunidades" className="text-[hsl(var(--senal))] text-sm underline mt-3 inline-block"><Icon name="arrow-left" weight="regular" /> Volver al embudo</Link></div>;

  return (
    <div className="xhub-page xhub-crm-page crm-deal-detail">
      <div className="xhub-page-heading" data-hero="commerce" data-hero-size="detail">
        <div>
          <Link href="/oportunidades" className="crm-back-link"><Icon name="arrow-left" weight="regular" />Volver al embudo</Link>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge rol="senal">{o.etapa}</Badge>
            <Badge rol={o.estado === "ganada" ? "exito" : o.estado === "perdida" ? "critico" : "neutro"}>{o.estado}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1.5">{o.titulo}</h1>
          <p className="crm-deal-meta">{clp(o.valor)}{o.persona_email ? ` · ${o.persona_email}` : ""} · creada {fecha(o.creado_en)}</p>
          {puede && (
            <div className="crm-deal-tags flex items-center gap-1.5 flex-wrap mt-2">
              {(o.etiquetas ?? []).map((e) => (
                <span key={e} className="inline-flex items-center gap-1 rounded-pill bg-secondary px-2 py-0.5 text-[11.5px]">{e}<button onClick={() => fijarEtiquetas((o.etiquetas ?? []).filter((x) => x !== e))} aria-label={`Quitar etiqueta ${e}`} className="text-muted-foreground hover:text-[hsl(var(--critico))]"><Icon name="x" /></button></span>
              ))}
              <input aria-label="Añadir etiqueta" value={nuevaEtq} onChange={(e) => setNuevaEtq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && nuevaEtq.trim()) { fijarEtiquetas([...(o.etiquetas ?? []), nuevaEtq.trim()]); setNuevaEtq(""); } }} placeholder="+ etiqueta" className="h-7 w-28 rounded-pill border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}
        </div>
      </div>

      {error && <div role="alert" className="crm-error mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" /> {error}</div>}

      {puede && (
        <Card className="crm-activity-composer mb-4"><CardContent className="pt-4">
          <div className="crm-activity-types flex gap-1.5 mb-2 flex-wrap">
            {TIPOS.map(([v, l]) => (
              <button key={v} aria-pressed={tipo === v} onClick={() => setTipo(v)} className={"px-3 h-8 rounded-md text-[13px] font-medium border " + (tipo === v ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}><Icon name={icono[v]} weight="regular" />{l}</button>
            ))}
          </div>
          <textarea aria-label="Descripción de la actividad" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={3} placeholder="Registra la actividad…" className="w-full rounded-md border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="mt-2"><Button size="sm" onClick={agregar} disabled={enviando || !cuerpo.trim()}><Icon name={enviando ? "spinner-gap" : "plus"} weight="regular" />{enviando ? "Guardando…" : "Agregar actividad"}</Button></div>
        </CardContent></Card>
      )}

      <Card className="crm-products-card mb-4"><CardContent className="pt-5">
        <div className="crm-section-title"><Icon name="stack" weight="duotone" /><h2>Productos</h2></div>
        {items.length > 0 ? (
          <div className="space-y-1.5 mb-3">
            {items.map((li) => (
              <div key={li.id} className="crm-product-row">
                <span className="flex-1 truncate">{li.nombre}</span>
                <span className="text-muted-foreground tabular-nums">{li.cantidad} × ${li.precio.toLocaleString("es-CL")}</span>
                <span className="w-24 text-right tabular-nums font-medium">${(li.cantidad * li.precio).toLocaleString("es-CL")}</span>
                {puede && <button onClick={() => quitarItem(li.id)} className="text-muted-foreground hover:text-[hsl(var(--critico))] text-xs">quitar</button>}
              </div>
            ))}
            <div className="flex items-center gap-2 text-[13px] pt-1.5 border-t border-border font-semibold"><span className="flex-1">Total</span><span className="w-24 text-right tabular-nums">${items.reduce((a, li) => a + li.cantidad * li.precio, 0).toLocaleString("es-CL")}</span></div>
          </div>
        ) : <div className="text-[12.5px] text-muted-foreground mb-3">Sin productos en este deal.</div>}
        {puede && (
          <div className="crm-product-form">
            <label className="flex flex-col"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Producto</span>
              <select value={pf.productoId} onChange={(e) => { const c = catalogo.find((x) => x.id === e.target.value); setPf({ ...pf, productoId: e.target.value, nombre: c?.nombre ?? "", precio: c?.precio ?? 0 }); }} className="mt-1 h-9 rounded-md border border-border bg-background px-2 text-[13px] max-w-[160px]"><option value="">— manual —</option>{catalogo.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            {!pf.productoId && <label className="flex flex-col"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Nombre</span><Input value={pf.nombre} onChange={(e) => setPf({ ...pf, nombre: e.target.value })} className="mt-1 h-9 w-36" /></label>}
            <label className="flex flex-col"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Cant.</span><Input type="number" value={pf.cantidad} onChange={(e) => setPf({ ...pf, cantidad: Number(e.target.value) })} className="mt-1 h-9 w-16" /></label>
            <label className="flex flex-col"><span className="text-[9px] uppercase tracking-widest text-muted-foreground">Precio</span><Input type="number" value={pf.precio} onChange={(e) => setPf({ ...pf, precio: Number(e.target.value) })} className="mt-1 h-9 w-24" /></label>
            <Button size="sm" onClick={agregarItem}>Agregar</Button>
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="pt-5">
        <div className="crm-section-title"><Icon name="clock-counter-clockwise" weight="duotone" /><h2>Actividad</h2></div>
        {o.actividades.length === 0 ? <div className="text-[13px] text-muted-foreground">Sin actividades todavía.</div> : (
          <div className="space-y-0">
            {o.actividades.map((a) => (
              <div key={a.id} className="crm-timeline-row">
                <span className="crm-timeline-icon"><Icon name={icono[a.tipo] ?? "chat-circle"} weight="duotone" /></span>
                <div className="min-w-0 flex-1">
                  <div className={"text-[13.5px] whitespace-pre-wrap " + (a.tipo === "tarea" && a.hecho ? "line-through text-muted-foreground" : "")}>{a.cuerpo}</div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">{a.tipo} · {fecha(a.creado_en)}</div>
                </div>
                {a.tipo === "tarea" && puede && (
                  <button onClick={() => toggle(a.id, !a.hecho)} title="marcar hecha" aria-label={`Marcar tarea: ${a.cuerpo}`} aria-pressed={a.hecho}
                    className={"h-5 w-5 rounded border shrink-0 mt-0.5 grid place-items-center " + (a.hecho ? "bg-[hsl(var(--exito))] border-[hsl(var(--exito))] text-white" : "border-border")}>{a.hecho && <Icon name="check" weight="regular" />}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      {/* Puente xCRM ↔ xTickets: el soporte de esta misma persona */}
      {tickets.length > 0 && (
        <Card className="mt-4"><CardContent className="pt-5">
          <div className="crm-section-title"><Icon name="ticket" weight="duotone" /><h2>Tickets de esta persona</h2></div>
          <div className="space-y-0">
            {tickets.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 border-t border-border first:border-t-0 hover:opacity-80">
                <div className="min-w-0">
                  <div className="text-[13px] truncate">#{t.numero} · {t.asunto}</div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">{t.estado} · {t.prioridad} · {fecha(t.creado_en)}</div>
                </div>
                <span className="text-[hsl(var(--senal))] text-xs shrink-0">Ver <Icon name="arrow-up-right" weight="regular" /></span>
              </Link>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
