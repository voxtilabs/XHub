"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";

type Cliente = { id: string; nombre: string; estado: string; modulos: string[] };
const MODULOS: { k: string; nombre: string }[] = [
  { k: "tickets", nombre: "xTickets" },
  { k: "crm", nombre: "xCRM" },
];
const estRol = (e: string): "exito" | "senal" | "critico" | "neutro" =>
  e === "activo" ? "exito" : e === "en_alta" ? "senal" : e === "moroso" ? "critico" : "neutro";

export default function Superadmin() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [llave, setLlave] = useState<{ cliente: string; token: string } | null>(null);

  async function cargar() {
    setCargando(true); setError(null);
    try { setClientes((await apiFetch<{ datos: Cliente[] }>("/admin/clientes")).datos); }
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

      <div className="xhub-page">
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DE LA PLATAFORMA</div>
            <h1>Clientes</h1>
            <p>Gestiona cada espacio de trabajo y sus módulos.</p>
          </div>
        </div>
        <div className="xhub-stats grid gap-4 mb-8 sm:grid-cols-3">
          {([["Clientes", clientes.length], ["Activos", activos], ["Módulos xTickets", clientes.filter((c) => c.modulos.includes("tickets")).length]] as const).map(([l, n]) => (
            <Card key={l} className="xhub-stat">
              <CardContent className="pt-6">
                <div className="xhub-stat-top"><div className="xhub-stat-label">{l}</div><span className="xhub-stat-icon"><Icon name={l === "Clientes" ? "buildings" : l === "Activos" ? "pulse" : "ticket"} /></span></div>
                <div className="xhub-stat-value mt-3 tabular-nums">{cargando ? "·" : n}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Crear cliente — REAL, pega a POST /admin/clientes */}
        <Card className="xhub-create-card mb-8"><CardContent className="pt-6">
          <div className="xhub-section-heading xhub-panel-heading mb-4"><Icon name="building-office" /> Crear cliente</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input aria-label="Nombre del cliente" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente (ej: Retail Andes SpA)"
              onKeyDown={(e) => e.key === "Enter" && crear()} className="sm:flex-1" />
            <Button onClick={crear} disabled={nombre.trim().length < 2 || creando}><Icon name={creando ? "spinner-gap" : "plus"} className={creando ? "animate-spin" : ""} />{creando ? "Creando…" : "Crear cliente"}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Crea su espacio y elige los módulos que necesita.</p>
        </CardContent></Card>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}

        {llave && (
          <Card className="mb-4" style={{ borderColor: "hsl(var(--senal)/0.5)" }}><CardContent className="pt-6">
            <div className="text-xs font-medium tracking-widest uppercase text-[hsl(var(--senal))] mb-2">Llave de API creada · {llave.cliente}</div>
            <div className="font-mono text-[12px] break-all bg-secondary rounded-md p-3">{llave.token}</div>
            <p className="text-[11px] text-muted-foreground mt-2"><Icon name="warning" className="xhub-inline-icon" /> Se muestra <b>una sola vez</b> — cópiala ahora. En la base solo queda su hash.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => setLlave(null)}><Icon name="check" /> Listo, la copié</Button>
          </CardContent></Card>
        )}

        <div className="flex justify-between items-center mb-4 gap-3">
          <h2 className="xhub-section-heading xhub-panel-heading"><Icon name="buildings" /> Clientes</h2>
          <button onClick={cargar} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><Icon name="arrows-clockwise" /> Actualizar</button>
        </div>

        {cargando ? (
          <div className="text-sm text-muted-foreground font-mono py-8 text-center">Cargando clientes del API…</div>
        ) : clientes.length === 0 ? (
          <Card><CardContent className="xhub-empty-state py-10 text-center text-muted-foreground text-sm"><Icon name="buildings" className="text-3xl" /><p>Aún no hay clientes. Crea el primero arriba.</p></CardContent></Card>
        ) : (
          <div className="xhub-client-list grid gap-4 xl:grid-cols-2">
            {clientes.map((cl) => (
              <Card key={cl.id} className="xhub-client-card"><CardContent className="pt-5 pb-5">
                <div className="xhub-client-head flex flex-wrap items-center gap-3">
                  <span className="xhub-feature-icon"><Icon name="buildings" /></span>
                  <a href={`/superadmin/cliente?id=${cl.id}`} className="min-w-0 flex-1 font-medium hover:text-[var(--voxia-action-text)]">{cl.nombre}</a>
                  <Badge rol={estRol(cl.estado)}>{cl.estado.replace("_", " ")}</Badge>
                </div>
                <div className="xhub-client-modules flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mr-1">Módulos:</span>
                  {MODULOS.map((m) => {
                    const on = cl.modulos.includes(m.k);
                    return (
                      <button key={m.k} aria-pressed={on} onClick={() => toggle(cl, m.k)}
                        className={"px-3 h-8 rounded-pill text-[13px] font-medium border transition " + (on ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                        <span className="mr-1.5" style={{ color: on ? "hsl(var(--exito))" : "hsl(var(--muted-foreground))" }}><Icon name={on ? "check-circle" : "circle"} /></span>{m.nombre}
                      </button>
                    );
                  })}
                </div>
                <div className="xhub-client-actions flex flex-wrap items-center justify-between gap-3">
                  <a href={`/superadmin/cliente?id=${cl.id}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--voxia-action-text)] hover:underline">Gestionar <Icon name="arrow-up-right" /></a>
                  <Button variant="secondary" size="sm" onClick={() => nuevaLlave(cl)}><Icon name="key" /> Llave API</Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
