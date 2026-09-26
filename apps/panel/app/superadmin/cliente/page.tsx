"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";

type Cliente = { id: string; nombre: string; estado: string; modulos: string[] };
type Consumo = { total: number; cuotaMensual: number; dia: string };
type Triage = { modo: "automatico" | "sugerir" | "manual"; umbral: number };
type UsuarioCliente = { id: string; email: string; nombre: string; rol: string; creadoEn: string };
type Usuarios = { limite: number; usados: number; usuarios: UsuarioCliente[] };
const ESTADOS = ["en_alta", "activo", "moroso", "solo_lectura", "suspendido"];
const MODULOS = [{ k: "tickets", n: "xTickets" }, { k: "crm", n: "xCRM" }];
const MODOS: { k: Triage["modo"]; n: string; d: string }[] = [
  { k: "automatico", n: "Automático", d: "crea el ticket solo si supera el umbral" },
  { k: "sugerir", n: "Sugerir", d: "lo propone, un humano confirma" },
  { k: "manual", n: "Manual", d: "la IA no crea tickets" },
];
const estRol = (e: string): "exito" | "senal" | "critico" | "neutro" =>
  e === "activo" ? "exito" : e === "en_alta" ? "senal" : (e === "moroso" || e === "suspendido") ? "critico" : "neutro";

export default function ClienteDetalle() {
  const [id, setId] = useState("");
  const [cli, setCli] = useState<Cliente | null>(null);
  const [consumo, setConsumo] = useState<Consumo | null>(null);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [cuota, setCuota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [llave, setLlave] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<Usuarios | null>(null);
  const [lim, setLim] = useState("");
  const [nu, setNu] = useState({ email: "", nombre: "", password: "" });

  async function cargar(cid: string) {
    try {
      const lista = await apiFetch<{ datos: Cliente[] }>("/admin/clientes");
      setCli(lista.datos.find((x) => x.id === cid) ?? null);
      const co = await apiFetch<Consumo>(`/admin/clientes/${cid}/consumo`); setConsumo(co); setCuota(String(co.cuotaMensual));
      setTriage(await apiFetch<Triage>(`/admin/clientes/${cid}/triage`));
      const us = await apiFetch<Usuarios>(`/admin/clientes/${cid}/usuarios`); setUsuarios(us); setLim(String(us.limite));
    } catch (e) { setError((e as Error).message); }
  }
  async function recargarUsuarios(cid: string) {
    try { const us = await apiFetch<Usuarios>(`/admin/clientes/${cid}/usuarios`); setUsuarios(us); setLim(String(us.limite)); } catch { /* noop */ }
  }
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get("id") || "";
    if (!cid) { location.href = "/superadmin"; return; }
    setId(cid); cargar(cid);
  }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2200); };
  async function accion(fn: () => Promise<void>, ok: string) {
    setError(null);
    try { await fn(); flash(ok); } catch (e) { setError((e as Error).message); }
  }
  const setEstado = (estado: string) => accion(async () => { await apiFetch(`/admin/clientes/${id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) }); setCli((c) => c && { ...c, estado }); }, "Estado actualizado");
  const toggle = (mod: string) => accion(async () => { const on = !cli!.modulos.includes(mod); await apiFetch(`/admin/clientes/${id}/modulos/${mod}`, { method: "PUT", body: JSON.stringify({ encendido: on }) }); setCli((c) => c && { ...c, modulos: on ? [...c.modulos, mod] : c.modulos.filter((m) => m !== mod) }); }, "Módulo actualizado");
  const guardarCuota = () => accion(async () => { const n = Number(cuota); await apiFetch(`/admin/clientes/${id}/cuota`, { method: "PUT", body: JSON.stringify({ limiteMensual: n }) }); setConsumo((c) => c && { ...c, cuotaMensual: n }); }, "Cuota fijada");
  const guardarTriage = (t: Triage) => accion(async () => { await apiFetch(`/admin/clientes/${id}/triage`, { method: "PUT", body: JSON.stringify(t) }); setTriage(t); }, "Triage guardado");
  const nuevaLlave = () => accion(async () => { const r = await apiFetch<{ token: string }>(`/admin/clientes/${id}/llaves`, { method: "POST", body: JSON.stringify({ nombre: "Panel " + new Date().toISOString().slice(0, 10) }) }); setLlave(r.token); }, "Llave creada");
  const guardarLimite = () => accion(async () => { const n = Number(lim); await apiFetch(`/admin/clientes/${id}/limite-usuarios`, { method: "PUT", body: JSON.stringify({ limite: n }) }); setUsuarios((u) => u && { ...u, limite: n }); }, "Tope de usuarios fijado");
  const crearUsuario = () => accion(async () => {
    await apiFetch(`/admin/clientes/${id}/usuarios`, { method: "POST", body: JSON.stringify(nu) });
    setNu({ email: "", nombre: "", password: "" }); await recargarUsuarios(id);
  }, "Admin del cliente creado");

  const pct = consumo && consumo.cuotaMensual > 0 ? Math.min(100, Math.round((consumo.total / consumo.cuotaMensual) * 100)) : 0;

  return (
    <main className="min-h-screen">
      <AppShell />

      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-6 flex items-center gap-3 flex-wrap">
        <a href="/superadmin" className="text-sm text-muted-foreground hover:text-foreground">← Clientes</a>
        <span className="font-semibold text-xl tracking-tight">{cli?.nombre ?? "Cliente"}</span>
        {cli && <Badge rol={estRol(cli.estado)}>{cli.estado.replace("_", " ")}</Badge>}
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-8 flex flex-col gap-5">
        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}>✓ {msg}</div>}
        {llave && (
          <Card style={{ borderColor: "hsl(var(--senal)/0.5)" }}><CardContent className="pt-5">
            <div className="text-xs font-black uppercase tracking-widest text-[hsl(var(--senal))] mb-2">Llave de API creada</div>
            <div className="font-mono text-[12px] break-all bg-secondary rounded-md p-3">{llave}</div>
            <p className="text-[11px] text-muted-foreground mt-2">⚠ Se muestra una sola vez — cópiala ahora.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => setLlave(null)}>La copié</Button>
          </CardContent></Card>
        )}

        {/* Estado */}
        <Card><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Estado del cliente</div>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((e) => (
              <button key={e} onClick={() => setEstado(e)}
                className={"px-3 h-8 rounded-pill text-[13px] font-medium border capitalize " + (cli?.estado === e ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{e.replace("_", " ")}</button>
            ))}
          </div>
        </CardContent></Card>

        {/* Módulos */}
        <Card><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Módulos</div>
          <div className="flex flex-wrap gap-2">
            {MODULOS.map((m) => {
              const on = cli?.modulos.includes(m.k);
              return <button key={m.k} onClick={() => toggle(m.k)} className={"px-3 h-9 rounded-pill text-[13px] font-medium border " + (on ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <span className="mr-1.5" style={{ color: on ? "hsl(var(--exito))" : "hsl(var(--muted-foreground))" }}>{on ? "●" : "○"}</span>{m.n}</button>;
            })}
          </div>
        </CardContent></Card>

        {/* Cuota + consumo */}
        <Card><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">API · cuota y consumo</div>
          <div className="flex items-end justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Consumo de hoy</span>
            <span className="tabular-nums">{consumo ? consumo.total.toLocaleString("es-CL") : "…"} / {consumo ? consumo.cuotaMensual.toLocaleString("es-CL") : "…"}</span>
          </div>
          <div className="h-2 rounded-pill bg-secondary overflow-hidden"><div className="h-full rounded-pill" style={{ width: `${pct}%`, background: pct >= 80 ? "hsl(var(--aviso))" : "hsl(var(--senal))" }} /></div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Input type="number" value={cuota} onChange={(e) => setCuota(e.target.value)} placeholder="Tope mensual" className="sm:flex-1" />
            <Button variant="secondary" onClick={guardarCuota}>Fijar cuota</Button>
          </div>
        </CardContent></Card>

        {/* Usuarios y tope — la jerarquía del negocio hecha visible */}
        <Card><CardContent className="pt-5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Usuarios y accesos</div>
            {usuarios && <span className="text-[13px] tabular-nums text-muted-foreground">{usuarios.usados} / {usuarios.limite}</span>}
          </div>
          <p className="text-[12px] text-muted-foreground mb-3">La <b className="text-foreground">plataforma</b> fija el tope. El <b className="text-foreground">admin del cliente</b> crea y da permisos a sus usuarios dentro de ese tope.</p>

          {/* Tope (lo fija plataforma) */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Input type="number" value={lim} onChange={(e) => setLim(e.target.value)} placeholder="Tope de usuarios" className="sm:flex-1" />
            <Button variant="secondary" onClick={guardarLimite}>Fijar tope</Button>
          </div>

          {/* Lista de usuarios del cliente */}
          <div className="flex flex-col gap-1.5 mb-4">
            {usuarios && usuarios.usuarios.length === 0 && <div className="text-[13px] text-muted-foreground">Aún sin usuarios. Crea el primer administrador del cliente abajo.</div>}
            {usuarios?.usuarios.map((u) => (
              <div key={u.id} className="flex items-center gap-2 justify-between rounded-md bg-secondary/50 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{u.nombre || u.email}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                </div>
                <Badge rol={u.rol === "admin_cliente" ? "senal" : "neutro"}>{u.rol === "admin_cliente" ? "Admin" : u.rol}</Badge>
              </div>
            ))}
          </div>

          {/* Alta del admin del cliente (respeta el tope) */}
          {usuarios && usuarios.usados >= usuarios.limite ? (
            <div className="text-[12px] rounded-md px-3 py-2" style={{ background: "hsl(var(--aviso)/0.1)", color: "hsl(var(--aviso))" }}>
              Tope alcanzado. Sube el límite para crear más usuarios.
            </div>
          ) : (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nuevo administrador del cliente</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input value={nu.nombre} onChange={(e) => setNu({ ...nu, nombre: e.target.value })} placeholder="Nombre" className="sm:flex-1" />
                <Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="Email" className="sm:flex-1" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="Contraseña (mín. 10)" className="sm:flex-1" />
                <Button onClick={crearUsuario} disabled={nu.email.length < 3 || nu.password.length < 10 || nu.nombre.length < 2}>Crear admin</Button>
              </div>
            </div>
          )}
        </CardContent></Card>

        {/* Triage IA */}
        <Card><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Triage con IA</div>
          <p className="text-[12px] text-muted-foreground mb-3">No todo contacto de XContact es un ticket. La IA da una confianza; tú fijas el umbral.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {MODOS.map((m) => (
              <button key={m.k} onClick={() => triage && guardarTriage({ ...triage, modo: m.k })} title={m.d}
                className={"px-3 h-9 rounded-pill text-[13px] font-medium border " + (triage?.modo === m.k ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{m.n}</button>
            ))}
          </div>
          {triage && (
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">Umbral de confianza</span><span className="tabular-nums font-semibold text-[hsl(var(--senal))]">{Math.round(triage.umbral * 100)}%</span></div>
              <input type="range" min={0} max={100} value={Math.round(triage.umbral * 100)}
                onChange={(e) => setTriage({ ...triage, umbral: Number(e.target.value) / 100 })}
                onMouseUp={() => guardarTriage(triage)} onTouchEnd={() => guardarTriage(triage)}
                className="w-full accent-[hsl(var(--primary))]" />
              <p className="text-[11px] text-muted-foreground mt-1">Solo se crea/sugiere si la confianza ≥ {Math.round(triage.umbral * 100)}%.</p>
            </div>
          )}
        </CardContent></Card>

        <Button variant="secondary" onClick={nuevaLlave}>+ Nueva llave de API</Button>
      </div>
    </main>
  );
}
