"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { usePrompt } from "@/components/prompt-dialog";
import { EditorMarca } from "@/components/editor-marca";

type Cliente = { id: string; nombre: string; estado: string; modulos: string[] };
type Panorama = {
  clientes: { total: number; activos: number; conTickets: number };
  tickets: { abiertos: number; vencidos: number; total: number };
  ia: { total: number; tokensPrompt: number; tokensSalida: number };
  porCliente: { id: string; abiertos: number; vencidos: number; total: number }[];
};
type Plan = { id: string; nombre: string; modulos: string[]; limiteUsuarios: number; cuotaMensual: number };
const MODULOS: { k: string; nombre: string }[] = [
  { k: "tickets", nombre: "xTickets" },
  { k: "crm", nombre: "xCRM" },
];
const estRol = (e: string): "exito" | "senal" | "critico" | "neutro" =>
  e === "activo" ? "exito" : e === "en_alta" ? "senal" : e === "moroso" ? "critico" : "neutro";

export default function Superadmin() {
  const { ask, dialog } = usePrompt();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [llave, setLlave] = useState<{ cliente: string; token: string } | null>(null);
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null);
  const [pan, setPan] = useState<Panorama | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [pf, setPf] = useState({ nombre: "", tickets: true, crm: false, limiteUsuarios: 5, cuotaMensual: 100000 });

  async function cargar() {
    setCargando(true); setError(null);
    try {
      setClientes((await apiFetch<{ datos: Cliente[] }>("/admin/clientes")).datos);
      apiFetch<Panorama>("/admin/panorama").then(setPan).catch(() => {});
      apiFetch<{ datos: Plan[] }>("/admin/planes").then((r) => setPlanes(r.datos)).catch(() => {});
    }
    catch (e) { setError((e as Error).message); }
    finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (nombre.trim().length < 2 || creando) return;
    setCreando(true); setError(null);
    try { await apiFetch("/admin/clientes", { method: "POST", body: JSON.stringify({ nombre: nombre.trim() }) }); setNombre(""); await cargar(); }
    catch (e) { setError((e as Error).message); }
    finally { setCreando(false); }
  }
  async function toggle(cl: Cliente, mod: string) {
    const encendido = !cl.modulos.includes(mod);
    setClientes((cs) => cs.map((c) => c.id === cl.id ? { ...c, modulos: encendido ? [...c.modulos, mod] : c.modulos.filter((m) => m !== mod) } : c));
    try { await apiFetch(`/admin/clientes/${cl.id}/modulos/${mod}`, { method: "PUT", body: JSON.stringify({ encendido }) }); }
    catch (e) { setError((e as Error).message); await cargar(); }
  }
  async function crearPlan() {
    if (pf.nombre.trim().length < 2) return;
    const modulos = [pf.tickets ? "tickets" : null, pf.crm ? "crm" : null].filter(Boolean) as string[];
    try {
      await apiFetch("/admin/planes", { method: "POST", body: JSON.stringify({ nombre: pf.nombre.trim(), modulos, limiteUsuarios: Number(pf.limiteUsuarios), cuotaMensual: Number(pf.cuotaMensual) }) });
      setPf({ nombre: "", tickets: true, crm: false, limiteUsuarios: 5, cuotaMensual: 100000 });
      const r = await apiFetch<{ datos: Plan[] }>("/admin/planes"); setPlanes(r.datos);
    } catch (e) { setError((e as Error).message); }
  }
  async function borrarPlan(pid: string) {
    try { await apiFetch(`/admin/planes/${pid}`, { method: "DELETE" }); setPlanes((ps) => ps.filter((p) => p.id !== pid)); }
    catch (e) { setError((e as Error).message); }
  }
  async function aplicarPlan(cl: Cliente, planId: string) {
    if (!planId) return;
    try { await apiFetch(`/admin/clientes/${cl.id}/aplicar-plan`, { method: "POST", body: JSON.stringify({ planId }) }); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }
  async function entrarSoporte(cl: Cliente) {
    const motivo = await ask(`Motivo del acceso de soporte a "${cl.nombre}" (queda auditado):`, "", { title: "Acceso de soporte", icon: "headset", confirmLabel: "Entrar a soporte" });
    if (!motivo || motivo.trim().length < 4) return;
    try { await apiFetch("/admin/soporte", { method: "POST", body: JSON.stringify({ clienteId: cl.id, motivo: motivo.trim() }) }); window.location.href = "/tickets"; }
    catch (e) { setError((e as Error).message); }
  }
  async function nuevaLlave(cl: Cliente) {
    setError(null);
    try {
      const r = await apiFetch<{ token: string }>(`/admin/clientes/${cl.id}/llaves`, { method: "POST", body: JSON.stringify({ nombre: "Panel " + new Date().toISOString().slice(0, 10) }) });
      setLlave({ cliente: cl.nombre, token: r.token });
    } catch (e) { setError((e as Error).message); }
  }

  const activos = clientes.filter((c) => c.estado === "activo").length;

  return (
    <main className="min-h-screen">
      <AppShell />
      {dialog}

      <div className="xhub-page xhub-platform-page">
        <div className="xhub-page-heading">
          <div><div className="xhub-eyebrow">ADMINISTRACIÓN · PLATAFORMA</div><h1>Clientes</h1><p>Una vista completa de tu operación. Cada cliente, conectado.</p></div>
          <a href="/superadmin/xcontact" className="voxia-button-primary inline-flex items-center gap-2"><Icon name="plugs-connected" weight="regular" /> Probar XContact</a>
        </div>
        <div className="xhub-platform-stats">
          {([
            ["Clientes", pan ? pan.clientes.total : clientes.length, "--senal"],
            ["Activos", pan ? pan.clientes.activos : activos, "--exito"],
            ["Tickets abiertos", pan ? pan.tickets.abiertos : null, "--aviso"],
            ["SLA vencidos", pan ? pan.tickets.vencidos : null, (pan && pan.tickets.vencidos > 0) ? "--critico" : "--muted-foreground"],
            ["IA · 30 días", pan ? pan.ia.total : null, "--senal"],
          ] as const).map(([l, n, col]) => (
            <Card key={l} className="xhub-platform-stat">
              <CardContent className="pt-6">
                <span className="xhub-platform-glyph" data-critical={l === "SLA vencidos" && !!pan?.tickets.vencidos}><Icon name={l === "Clientes" ? "buildings" : l === "Activos" ? "check-circle" : l === "Tickets abiertos" ? "chats-circle" : l === "SLA vencidos" ? "warning-circle" : "cpu"} weight="regular" /></span>
                <div className="text-[11px] font-black tracking-widest uppercase text-muted-foreground">{l}</div>
                <div className="text-4xl font-semibold tracking-tight mt-1 tabular-nums" style={{ color: `hsl(var(${col}))` }}>{n == null ? (cargando ? "·" : "·") : n}</div>
                {l === "IA · 30 días" && pan && <div className="text-[10.5px] text-muted-foreground mt-1">{(pan.ia.tokensPrompt + pan.ia.tokensSalida).toLocaleString("es-CL")} tokens</div>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Planes (plantillas de suscripción) */}
        <Card className="mb-6 xhub-platform-panel"><CardContent className="pt-6">
          <h2 className="xhub-section-heading mb-4"><Icon name="stack" weight="regular" /> Planes de suscripción</h2>
          {planes.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-4">
              {planes.map((p) => (
                <div key={p.id} className="xhub-plan-row flex items-center gap-2 text-[13px] rounded-md bg-secondary/40 px-3 py-1.5">
                  <span className="font-medium">{p.nombre}</span>
                  <span className="text-muted-foreground">· {p.modulos.length ? p.modulos.join(", ") : "sin módulos"} · {p.limiteUsuarios} usuarios · {p.cuotaMensual.toLocaleString("es-CL")} API/mes</span>
                  <button onClick={() => borrarPlan(p.id)} className="ml-auto text-muted-foreground hover:text-[hsl(var(--critico))] text-xs">eliminar</button>
                </div>
              ))}
            </div>
          )}
          <div className="xhub-plan-form">
            <label className="xhub-plan-name"><span>Nombre del plan</span><Input aria-label="Nombre del plan" value={pf.nombre} onChange={(e) => setPf({ ...pf, nombre: e.target.value })} placeholder="Por ejemplo, Pro" className="sm:flex-1 min-w-[140px]" /></label>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={pf.tickets} onChange={(e) => setPf({ ...pf, tickets: e.target.checked })} /> xTickets</label>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={pf.crm} onChange={(e) => setPf({ ...pf, crm: e.target.checked })} /> xCRM</label>
            <label className="xhub-plan-number"><span>Usuarios</span><Input aria-label="Tope de usuarios del plan" type="number" value={pf.limiteUsuarios} onChange={(e) => setPf({ ...pf, limiteUsuarios: Number(e.target.value) })} className="w-24" title="Tope usuarios" /></label>
            <label className="xhub-plan-number"><span>API / mes</span><Input aria-label="Cuota mensual de API del plan" type="number" value={pf.cuotaMensual} onChange={(e) => setPf({ ...pf, cuotaMensual: Number(e.target.value) })} className="w-32" title="Cuota API/mes" /></label>
            <Button variant="secondary" onClick={crearPlan}><Icon name="plus" /> Crear plan</Button>
          </div>
        </CardContent></Card>

        {/* Crear cliente — REAL, pega a POST /admin/clientes */}
        <Card className="mb-6 xhub-platform-panel"><CardContent className="pt-6">
          <h2 className="xhub-section-heading mb-4"><Icon name="building-office" weight="regular" /> Crear cliente</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input aria-label="Nombre del nuevo cliente" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente (ej: Retail Andes SpA)"
              onKeyDown={(e) => e.key === "Enter" && crear()} className="sm:flex-1" />
            <Button onClick={crear} disabled={nombre.trim().length < 2 || creando}><Icon name={creando ? "spinner-gap" : "plus"} />{creando ? "Creando…" : "Crear cliente"}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Encender un módulo no migra datos: la historia de cada persona ya vive en el núcleo.</p>
        </CardContent></Card>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}

        {llave && (
          <Card className="mb-4" style={{ borderColor: "hsl(var(--senal)/0.5)" }}><CardContent className="pt-6">
            <div className="text-xs font-black tracking-widest uppercase text-[hsl(var(--senal))] mb-2">Llave de API creada · {llave.cliente}</div>
            <div className="font-mono text-[12px] break-all bg-secondary rounded-md p-3">{llave.token}</div>
            <p className="text-[11px] text-muted-foreground mt-2"><Icon name="warning" className="xhub-inline-icon" weight="regular" /> Se muestra <b>una sola vez</b> — cópiala ahora. En la base solo queda su hash.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => setLlave(null)}>Listo, la copié</Button>
          </CardContent></Card>
        )}

        <div className="flex justify-between items-center mb-3">
          <h2 className="xhub-section-heading"><Icon name="buildings" weight="regular" /> Directorio de clientes</h2>
          <button onClick={cargar} className="text-xs text-muted-foreground hover:text-foreground"><Icon name="arrows-clockwise" className="xhub-inline-icon" weight="regular" /> Actualizar</button>
        </div>

        {cargando ? (
          <div className="text-sm text-muted-foreground font-mono py-8 text-center">Cargando clientes del API…</div>
        ) : clientes.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Aún no hay clientes. Crea el primero arriba ↑</CardContent></Card>
        ) : (
          <div className="xhub-platform-clients">
            {clientes.map((cl) => (
              <Card key={cl.id} className="xhub-platform-client"><CardContent className="pt-5 pb-5">
                <div className="xhub-platform-client-head flex flex-wrap items-center gap-3">
                  <span className="xhub-platform-glyph"><Icon name="building-office" weight="regular" /></span>
                  <a href={`/superadmin/cliente?id=${cl.id}`} className="font-medium hover:text-[hsl(var(--senal))]">{cl.nombre}</a>
                  <Badge rol={estRol(cl.estado)}>{cl.estado.replace("_", " ")}</Badge>
                  <div className="flex-1" />
                  <a href={`/superadmin/cliente?id=${cl.id}`} className="text-xs text-[hsl(var(--senal))] hover:underline">Gestionar <Icon name="arrow-up-right" className="xhub-inline-icon" /></a>
                  <Button variant="secondary" size="sm" onClick={() => entrarSoporte(cl)}><Icon name="headset" weight="regular" /> Soporte</Button>
                  <Button variant="secondary" size="sm" aria-expanded={marcaAbierta === cl.id} onClick={() => setMarcaAbierta(marcaAbierta === cl.id ? null : cl.id)}><Icon name="sliders-horizontal" weight="regular" /> Marca</Button>
                  <Button variant="secondary" size="sm" onClick={() => nuevaLlave(cl)}><Icon name="key" weight="regular" /> Llave API</Button>
                  {planes.length > 0 && (
                    <select aria-label={`Aplicar plan a ${cl.nombre}`} defaultValue="" onChange={(e) => { const v = e.target.value; e.currentTarget.value = ""; aplicarPlan(cl, v); }}
                      className="h-8 rounded-md border border-border bg-background px-2 text-[12px]">
                      <option value="">Aplicar plan…</option>
                      {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mr-1">Módulos:</span>
                  {MODULOS.map((m) => {
                    const on = cl.modulos.includes(m.k);
                    return (
                      <button key={m.k} aria-pressed={on} onClick={() => toggle(cl, m.k)}
                        className={"px-3 h-8 rounded-pill text-[13px] font-medium border transition " + (on ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                        <span className="mr-1.5" style={{ color: on ? "hsl(var(--exito))" : "hsl(var(--muted-foreground))" }}><Icon name={on ? "check-circle" : "circle"} className="xhub-inline-icon" weight="regular" /></span>{m.nombre}
                      </button>
                    );
                  })}
                </div>
                {(() => { const t = pan?.porCliente.find((x) => x.id === cl.id); return t ? (
                  <div className="mt-2 text-[12px] text-muted-foreground">
                    <span className="tabular-nums font-medium text-foreground">{t.abiertos}</span> abiertos ·{" "}
                    <span className="tabular-nums font-medium" style={{ color: t.vencidos > 0 ? "hsl(var(--critico))" : undefined }}>{t.vencidos}</span> SLA vencidos ·{" "}
                    <span className="tabular-nums">{t.total}</span> tickets
                  </div>
                ) : null; })()}
                {marcaAbierta === cl.id && <EditorMarca clienteId={cl.id} />}
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
