"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { EditorMarca } from "@/components/editor-marca";

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
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null);

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

      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <div className="flex gap-4 mb-8 flex-wrap">
          {([["Clientes", clientes.length], ["Activos", activos], ["Módulos xTickets", clientes.filter((c) => c.modulos.includes("tickets")).length]] as const).map(([l, n]) => (
            <Card key={l} className="flex-1 min-w-[160px]">
              <CardContent className="pt-6">
                <div className="text-xs font-black tracking-widest uppercase text-[hsl(var(--senal))]">{l}</div>
                <div className="text-4xl font-semibold tracking-tight mt-1 tabular-nums">{cargando ? "·" : n}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Crear cliente — REAL, pega a POST /admin/clientes */}
        <Card className="mb-6"><CardContent className="pt-6">
          <div className="text-xs font-black tracking-widest uppercase text-muted-foreground mb-3">Crear cliente</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente (ej: Retail Andes SpA)"
              onKeyDown={(e) => e.key === "Enter" && crear()} className="sm:flex-1" />
            <Button onClick={crear} disabled={nombre.trim().length < 2 || creando}>{creando ? "Creando…" : "+ Crear cliente"}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Encender un módulo no migra datos: la historia de cada persona ya vive en el núcleo.</p>
        </CardContent></Card>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

        {llave && (
          <Card className="mb-4" style={{ borderColor: "hsl(var(--senal)/0.5)" }}><CardContent className="pt-6">
            <div className="text-xs font-black tracking-widest uppercase text-[hsl(var(--senal))] mb-2">Llave de API creada · {llave.cliente}</div>
            <div className="font-mono text-[12px] break-all bg-secondary rounded-md p-3">{llave.token}</div>
            <p className="text-[11px] text-muted-foreground mt-2">⚠ Se muestra <b>una sola vez</b> — cópiala ahora. En la base solo queda su hash.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => setLlave(null)}>Listo, la copié</Button>
          </CardContent></Card>
        )}

        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg tracking-tight">Clientes</h2>
          <button onClick={cargar} className="text-xs text-muted-foreground hover:text-foreground">↻ Actualizar</button>
        </div>

        {cargando ? (
          <div className="text-sm text-muted-foreground font-mono py-8 text-center">Cargando clientes del API…</div>
        ) : clientes.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Aún no hay clientes. Crea el primero arriba ↑</CardContent></Card>
        ) : (
          <div className="flex flex-col gap-3">
            {clientes.map((cl) => (
              <Card key={cl.id}><CardContent className="pt-5 pb-5">
                <div className="flex flex-wrap items-center gap-3">
                  <a href={`/superadmin/cliente?id=${cl.id}`} className="font-medium hover:text-[hsl(var(--senal))]">{cl.nombre}</a>
                  <Badge rol={estRol(cl.estado)}>{cl.estado.replace("_", " ")}</Badge>
                  <div className="flex-1" />
                  <a href={`/superadmin/cliente?id=${cl.id}`} className="text-xs text-[hsl(var(--senal))] hover:underline">Gestionar →</a>
                  <Button variant="secondary" size="sm" onClick={() => setMarcaAbierta(marcaAbierta === cl.id ? null : cl.id)}>Marca</Button>
                  <Button variant="secondary" size="sm" onClick={() => nuevaLlave(cl)}>+ Llave API</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mr-1">Módulos:</span>
                  {MODULOS.map((m) => {
                    const on = cl.modulos.includes(m.k);
                    return (
                      <button key={m.k} onClick={() => toggle(cl, m.k)}
                        className={"px-3 h-8 rounded-pill text-[13px] font-medium border transition " + (on ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                        <span className="mr-1.5" style={{ color: on ? "hsl(var(--exito))" : "hsl(var(--muted-foreground))" }}>{on ? "●" : "○"}</span>{m.nombre}
                      </button>
                    );
                  })}
                </div>
                {marcaAbierta === cl.id && <EditorMarca clienteId={cl.id} />}
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
