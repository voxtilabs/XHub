"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";

type Cliente = { id: string; nombre: string; estado: string; modulos: string[]; ia_modelo?: string | null };
type IAConfig = { modeloDefault: string | null; proveedor: string; modeloEnv: string | null; iaActiva: boolean };
type ScopeDef = { scope: string; modulo: string; descripcion: string };
type Llave = { id: string; nombre: string; prefijo: string; scopes: string[]; creada_en: string; ultimo_uso: string | null; revocada_en: string | null };
type Consumo = { total: number; cuotaMensual: number; dia: string };
type Triage = { modo: "automatico" | "sugerir" | "manual"; umbral: number };
type UsuarioCliente = { id: string; email: string; nombre: string; rol: string; creadoEn: string };
type Usuarios = { limite: number; usados: number; usuarios: UsuarioCliente[] };
type ResumenIA = {
  total: number; ok: number; fallidos: number; tokensPrompt: number; tokensSalida: number; msPromedio: number;
  porTarea: { tarea: string; llamadas: number; tokens: number }[];
  recientes: { tarea: string; proveedor: string; modelo: string; tokens: number; ms: number; ok: boolean; creadoEn: string }[];
};
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
  const [llaveScopes, setLlaveScopes] = useState<string[]>([]);
  const [scopesCat, setScopesCat] = useState<ScopeDef[]>([]);
  const [llaves, setLlaves] = useState<Llave[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [iaCfg, setIaCfg] = useState<IAConfig | null>(null);
  const [modeloDefault, setModeloDefault] = useState("");
  const [modeloCliente, setModeloCliente] = useState("");
  const [usuarios, setUsuarios] = useState<Usuarios | null>(null);
  const [lim, setLim] = useState("");
  const [nu, setNu] = useState({ email: "", nombre: "", password: "" });
  const [ia, setIa] = useState<ResumenIA | null>(null);

  async function cargar(cid: string) {
    try {
      const lista = await apiFetch<{ datos: Cliente[] }>("/admin/clientes");
      const yo = lista.datos.find((x) => x.id === cid) ?? null;
      setCli(yo); setModeloCliente(yo?.ia_modelo ?? "");
      const ia = await apiFetch<IAConfig>("/admin/ia/config"); setIaCfg(ia); setModeloDefault(ia.modeloDefault ?? "");
      const co = await apiFetch<Consumo>(`/admin/clientes/${cid}/consumo`); setConsumo(co); setCuota(String(co.cuotaMensual));
      setTriage(await apiFetch<Triage>(`/admin/clientes/${cid}/triage`));
      const us = await apiFetch<Usuarios>(`/admin/clientes/${cid}/usuarios`); setUsuarios(us); setLim(String(us.limite));
      setIa(await apiFetch<ResumenIA>(`/admin/clientes/${cid}/ia?dias=30`));
      setScopesCat((await apiFetch<{ datos: ScopeDef[] }>("/admin/scopes")).datos);
      setLlaves((await apiFetch<{ datos: Llave[] }>(`/admin/clientes/${cid}/llaves`)).datos);
    } catch (e) { setError((e as Error).message); }
  }
  const recargarLlaves = async () => { try { setLlaves((await apiFetch<{ datos: Llave[] }>(`/admin/clientes/${id}/llaves`)).datos); } catch { /* noop */ } };
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
  const guardarModeloDefault = () => accion(async () => { await apiFetch("/admin/ia/config", { method: "PUT", body: JSON.stringify({ modeloDefault: modeloDefault.trim() || null }) }); setIaCfg((c) => c && { ...c, modeloDefault: modeloDefault.trim() || null }); }, "Modelo por defecto guardado");
  const guardarModeloCliente = () => accion(async () => { await apiFetch(`/admin/clientes/${id}/ia-modelo`, { method: "PUT", body: JSON.stringify({ modelo: modeloCliente.trim() || null }) }); setCli((c) => c && { ...c, ia_modelo: modeloCliente.trim() || null }); }, "Modelo del cliente guardado");
  const nuevaLlave = () => accion(async () => { const r = await apiFetch<{ token: string; scopes: string[] }>(`/admin/clientes/${id}/llaves`, { method: "POST", body: JSON.stringify({ nombre: "Panel " + new Date().toISOString().slice(0, 10) }) }); setLlave(r.token); setLlaveScopes(r.scopes ?? []); await recargarLlaves(); }, "Llave creada");
  const abrirEdicion = (l: Llave) => { setEditando(l.id); setEditScopes(l.scopes); };
  const toggleScope = (s: string) => setEditScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const guardarScopes = (l: Llave) => accion(async () => { await apiFetch(`/admin/clientes/${id}/llaves/${l.id}/scopes`, { method: "PUT", body: JSON.stringify({ scopes: editScopes }) }); setEditando(null); await recargarLlaves(); }, "Scopes actualizados");
  const revocarLlave = (l: Llave) => accion(async () => { await apiFetch(`/admin/clientes/${id}/llaves/${l.id}`, { method: "DELETE" }); await recargarLlaves(); }, "Llave revocada");
  const guardarLimite = () => accion(async () => { const n = Number(lim); await apiFetch(`/admin/clientes/${id}/limite-usuarios`, { method: "PUT", body: JSON.stringify({ limite: n }) }); setUsuarios((u) => u && { ...u, limite: n }); }, "Tope de usuarios fijado");
  const crearUsuario = () => accion(async () => {
    await apiFetch(`/admin/clientes/${id}/usuarios`, { method: "POST", body: JSON.stringify(nu) });
    setNu({ email: "", nombre: "", password: "" }); await recargarUsuarios(id);
  }, "Admin del cliente creado");

  const pct = consumo && consumo.cuotaMensual > 0 ? Math.min(100, Math.round((consumo.total / consumo.cuotaMensual) * 100)) : 0;

  return (
    <main className="min-h-screen">
      <AppShell />

      <div className="xhub-page xhub-platform-page xhub-client-detail-page">
        <div className="xhub-page-heading">
          <div><a href="/superadmin" className="xhub-eyebrow inline-flex items-center gap-2"><Icon name="arrow-left" /> TODOS LOS CLIENTES</a><h1>{cli?.nombre ?? "Cliente"}</h1><p>Accesos, módulos e integraciones. Todo bajo control.</p></div>
          {cli && <Badge rol={estRol(cli.estado)}>{cli.estado.replace("_", " ")}</Badge>}
        </div>
        <div className="xhub-client-settings-grid">
        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" weight="regular" /> {msg}</div>}
        {llave && (
          <Card style={{ borderColor: "hsl(var(--senal)/0.5)" }}><CardContent className="pt-5">
            <div className="text-xs font-black uppercase tracking-widest text-[hsl(var(--senal))] mb-2">Llave de API creada</div>
            <div className="font-mono text-[12px] break-all bg-secondary rounded-md p-3">{llave}</div>
            {llaveScopes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {llaveScopes.map((s) => <span key={s} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{s}</span>)}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2"><Icon name="warning" className="xhub-inline-icon" weight="regular" /> Se muestra una sola vez — cópiala ahora. Alcances: {llaveScopes.length ? `${llaveScopes.length} (todos los módulos activos)` : "ninguno"}.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => setLlave(null)}>La copié</Button>
          </CardContent></Card>
        )}

        {/* Estado */}
        <Card><CardContent className="pt-5">
          <h2 className="xhub-section-heading mb-4"><Icon name="pulse" weight="regular" /> Estado del cliente</h2>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((e) => (
              <button key={e} aria-pressed={cli?.estado === e} onClick={() => setEstado(e)}
                className={"px-3 h-8 rounded-pill text-[13px] font-medium border capitalize " + (cli?.estado === e ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{e.replace("_", " ")}</button>
            ))}
          </div>
        </CardContent></Card>

        {/* Módulos */}
        <Card><CardContent className="pt-5">
          <h2 className="xhub-section-heading mb-4"><Icon name="squares-four" weight="regular" /> Módulos</h2>
          <div className="flex flex-wrap gap-2">
            {MODULOS.map((m) => {
              const on = cli?.modulos.includes(m.k);
              return <button key={m.k} aria-pressed={!!on} onClick={() => toggle(m.k)} className={"px-3 h-9 rounded-pill text-[13px] font-medium border " + (on ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <span className="mr-1.5" style={{ color: on ? "hsl(var(--exito))" : "hsl(var(--muted-foreground))" }}><Icon name={on ? "check-circle" : "circle"} className="xhub-inline-icon" weight="regular" /></span>{m.n}</button>;
            })}
          </div>
        </CardContent></Card>

        {/* Cuota + consumo */}
        <Card><CardContent className="pt-5">
          <h2 className="xhub-section-heading mb-4"><Icon name="gauge" weight="regular" /> API · cuota y consumo</h2>
          <div className="flex items-end justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Consumo de hoy</span>
            <span className="tabular-nums">{consumo ? consumo.total.toLocaleString("es-CL") : "…"} / {consumo ? consumo.cuotaMensual.toLocaleString("es-CL") : "…"}</span>
          </div>
          <div className="h-2 rounded-pill bg-secondary overflow-hidden"><div className="h-full rounded-pill" style={{ width: `${pct}%`, background: pct >= 80 ? "hsl(var(--aviso))" : "hsl(var(--senal))" }} /></div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Input aria-label="Cuota mensual de API" type="number" value={cuota} onChange={(e) => setCuota(e.target.value)} placeholder="Tope mensual" className="sm:flex-1" />
            <Button variant="secondary" onClick={guardarCuota}>Fijar cuota</Button>
          </div>
        </CardContent></Card>

        {/* Usuarios y tope — la jerarquía del negocio hecha visible */}
        <Card className="xhub-config-users"><CardContent className="pt-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="xhub-section-heading"><Icon name="users" weight="regular" /> Usuarios y accesos</h2>
            {usuarios && <span className="text-[13px] tabular-nums text-muted-foreground">{usuarios.usados} / {usuarios.limite}</span>}
          </div>
          <p className="text-[12px] text-muted-foreground mb-3">La <b className="text-foreground">plataforma</b> fija el tope. El <b className="text-foreground">admin del cliente</b> crea y da permisos a sus usuarios dentro de ese tope.</p>

          {/* Tope (lo fija plataforma) */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Input aria-label="Tope de usuarios" type="number" value={lim} onChange={(e) => setLim(e.target.value)} placeholder="Tope de usuarios" className="sm:flex-1" />
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
                <Input aria-label="Nombre del administrador" value={nu.nombre} onChange={(e) => setNu({ ...nu, nombre: e.target.value })} placeholder="Nombre" className="sm:flex-1" />
                <Input aria-label="Correo del administrador" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="Email" className="sm:flex-1" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input aria-label="Contraseña del administrador" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="Contraseña (mín. 10)" className="sm:flex-1" />
                <Button onClick={crearUsuario} disabled={nu.email.length < 3 || nu.password.length < 10 || nu.nombre.length < 2}>Crear admin</Button>
              </div>
            </div>
          )}
        </CardContent></Card>

        {/* Triage IA */}
        <Card><CardContent className="pt-5">
          <h2 className="xhub-section-heading mb-2"><Icon name="cpu" weight="regular" /> Triage con IA</h2>
          <p className="text-[12px] text-muted-foreground mb-3">No todo contacto de XContact es un ticket. La IA da una confianza; tú fijas el umbral.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {MODOS.map((m) => (
              <button key={m.k} aria-pressed={triage?.modo === m.k} onClick={() => triage && guardarTriage({ ...triage, modo: m.k })} title={m.d}
                className={"px-3 h-9 rounded-pill text-[13px] font-medium border " + (triage?.modo === m.k ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{m.n}</button>
            ))}
          </div>
          {triage && (
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">Umbral de confianza</span><span className="tabular-nums font-semibold text-[hsl(var(--senal))]">{Math.round(triage.umbral * 100)}%</span></div>
              <input aria-label="Umbral de confianza de IA" type="range" min={0} max={100} value={Math.round(triage.umbral * 100)}
                onChange={(e) => setTriage({ ...triage, umbral: Number(e.target.value) / 100 })}
                onMouseUp={() => guardarTriage(triage)} onTouchEnd={() => guardarTriage(triage)}
                className="w-full accent-[hsl(var(--primary))]" />
              <p className="text-[11px] text-muted-foreground mt-1">Solo se crea/sugiere si la confianza ≥ {Math.round(triage.umbral * 100)}%.</p>
            </div>
          )}
        </CardContent></Card>

        {/* Consumo de IA del cliente (qué hizo, cuánto) */}
        <Card className="xhub-config-ia"><CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="xhub-section-heading"><Icon name="chart-line" weight="regular" /> IA · actividad</h2>
            {ia && ia.total > 0 && <span className="text-[13px] tabular-nums text-muted-foreground">{(ia.tokensPrompt + ia.tokensSalida).toLocaleString("es-CL")} tokens</span>}
          </div>
          {!ia || ia.total === 0 ? (
            <p className="text-[13px] text-muted-foreground">Sin actividad de IA todavía para este cliente.</p>
          ) : (
            <>
              <div className="flex gap-4 flex-wrap mb-3">
                <div><div className="text-2xl font-semibold tabular-nums">{ia.total.toLocaleString("es-CL")}</div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Llamadas</div></div>
                <div><div className="text-2xl font-semibold tabular-nums" style={{ color: "hsl(var(--exito))" }}>{ia.ok}</div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">OK</div></div>
                <div><div className="text-2xl font-semibold tabular-nums" style={{ color: ia.fallidos ? "hsl(var(--critico))" : undefined }}>{ia.fallidos}</div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Fallidas</div></div>
                <div><div className="text-2xl font-semibold tabular-nums">{ia.msPromedio.toLocaleString("es-CL")}<span className="text-sm text-muted-foreground ml-0.5">ms</span></div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Latencia</div></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ia.porTarea.map((t) => (
                  <span key={t.tarea} className="text-[12px] rounded-pill bg-secondary px-2.5 py-1 capitalize">{t.tarea} · <span className="tabular-nums text-muted-foreground">{t.llamadas}</span></span>
                ))}
              </div>
            </>
          )}
        </CardContent></Card>

        {/* IA — proveedor + modelo por defecto y override por cliente */}
        <Card className="xhub-config-model"><CardContent className="pt-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="xhub-section-heading"><Icon name="cpu" weight="regular" /> Inteligencia artificial</h2>
            {iaCfg && <Badge rol={iaCfg.iaActiva ? "exito" : "neutro"}>{iaCfg.iaActiva ? `${iaCfg.proveedor} activo` : "IA apagada"}</Badge>}
          </div>
          <p className="text-[12px] text-muted-foreground mb-3">La llave del proveedor vive en el entorno (nunca acá). Solo se configura el <b>modelo</b>. Sin modelo del cliente, se usa el por defecto{iaCfg?.modeloEnv ? ` (env: ${iaCfg.modeloEnv})` : ""}.</p>
          <div className="space-y-3">
            <div className="flex items-end gap-2 flex-wrap">
              <label className="flex flex-col flex-1 min-w-[200px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modelo por defecto (toda la plataforma)</span><Input value={modeloDefault} onChange={(e) => setModeloDefault(e.target.value)} placeholder={iaCfg?.modeloEnv ?? "google/gemma-3-12b-it"} className="mt-1 font-mono text-[12px]" /></label>
              <Button variant="secondary" size="sm" onClick={guardarModeloDefault}>Guardar default</Button>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <label className="flex flex-col flex-1 min-w-[200px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modelo de {cli?.nombre ?? "este cliente"} (override)</span><Input value={modeloCliente} onChange={(e) => setModeloCliente(e.target.value)} placeholder={`(usa el default: ${modeloDefault || iaCfg?.modeloEnv || "—"})`} className="mt-1 font-mono text-[12px]" /></label>
              <Button variant="secondary" size="sm" onClick={guardarModeloCliente}>Guardar cliente</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Ej. económicos en OpenRouter: <code>google/gemma-3-12b-it</code>, <code>google/gemma-3-4b-it</code>, <code>meta-llama/llama-3.1-8b-instruct</code>. Dejá vacío el del cliente para heredar el default.</p>
          </div>
        </CardContent></Card>

        {/* Llaves de API — listar, crear, editar scopes, revocar */}
        <Card><CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="xhub-section-heading"><Icon name="key" weight="regular" /> Llaves de API</h2>
            <Button size="sm" variant="secondary" onClick={nuevaLlave}><Icon name="plus" /> Nueva llave</Button>
          </div>
          {llaves.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">Sin llaves. Al crear una recibe todos los scopes de los módulos activos del cliente; podés restringirla acá.</div>
          ) : (
            <div className="space-y-2">
              {llaves.map((l) => (
                <div key={l.id} className={"rounded-md border border-border p-3 " + (l.revocada_en ? "opacity-50" : "")}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <span className="font-mono text-[12.5px]">{l.prefijo}…</span>
                      <span className="text-[11px] text-muted-foreground ml-2">{l.nombre}</span>
                      {l.revocada_en && <span className="text-[10px] text-[hsl(var(--critico))] ml-2 uppercase font-bold">revocada</span>}
                    </div>
                    {!l.revocada_en && (
                      <div className="flex gap-3">
                        {editando === l.id ? (
                          <>
                            <button onClick={() => guardarScopes(l)} className="text-[12px] text-[hsl(var(--senal))] hover:underline">guardar</button>
                            <button onClick={() => setEditando(null)} className="text-[12px] text-muted-foreground hover:underline">cancelar</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => abrirEdicion(l)} className="text-[12px] text-[hsl(var(--senal))] hover:underline">editar scopes</button>
                            <button onClick={() => revocarLlave(l)} className="text-[12px] text-muted-foreground hover:text-[hsl(var(--critico))]">revocar</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {editando === l.id ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {scopesCat.map((s) => (
                        <button key={s.scope} aria-pressed={editScopes.includes(s.scope)} onClick={() => toggleScope(s.scope)} title={s.descripcion}
                          className={"text-[11px] font-mono px-2 py-1 rounded border " + (editScopes.includes(s.scope) ? "border-[hsl(var(--senal))] text-foreground" : "border-border text-muted-foreground")}
                          style={editScopes.includes(s.scope) ? { background: "hsl(var(--senal)/0.1)" } : undefined}>
                          {editScopes.includes(s.scope) && <Icon name="check" className="xhub-inline-icon" />}{s.scope}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {l.scopes.length === 0
                        ? <span className="text-[11px] text-muted-foreground">sin scopes declarados — hereda todos los del cliente</span>
                        : l.scopes.map((s) => <span key={s} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{s}</span>)}
                    </div>
                  )}
                  {l.ultimo_uso && <div className="text-[10px] text-muted-foreground mt-1.5">último uso: {l.ultimo_uso.slice(0, 16).replace("T", " ")}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
        </div>
      </div>
    </main>
  );
}
