"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { HeroFeatures } from "@/components/hero-features";

type Check = { nombre: string; detalle: string; ms: number; ok: boolean; nota?: string };
type Resumen = Record<string, boolean | number>;
type Resultado = { host: string; checks: Check[]; resumen: Resumen };
type Cliente = { id: string; nombre: string };
type Instancia = { id: string; nombre: string; host: string; version_api: string; usuario: string | null; credencial_ref: string | null; estado_salud: string; ultima_prueba: string | null; resumen: Resumen | null; creada_en: string };

const ESTADO_ROL: Record<string, "exito" | "aviso" | "critico" | "neutro"> = { operativa: "exito", parcial: "aviso", degradada: "aviso", caida: "critico", sin_probar: "neutro" };

export default function XContactProbe() {
  const [f, setF] = useState({ host: "x5.xcontact.cl", usuario: "voxtilabs", password: "", apiKey: "" });
  const [res, setRes] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [nombreInst, setNombreInst] = useState("XContact producción");
  const [credRef, setCredRef] = useState("");
  const [sincronizando, setSincronizando] = useState("");

  useEffect(() => { apiFetch<{ datos: Cliente[] }>("/admin/clientes").then((r) => setClientes(r.datos)).catch(() => {}); }, []);
  const cargarInstancias = (cid: string) => { if (!cid) { setInstancias([]); return; } apiFetch<{ datos: Instancia[] }>(`/admin/clientes/${cid}/xcontact/instancias`).then((r) => setInstancias(r.datos)).catch(() => setInstancias([])); };
  useEffect(() => { cargarInstancias(clienteId); }, [clienteId]);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };

  async function probar() {
    setProbando(true); setError(null); setRes(null);
    try { setRes(await apiFetch<Resultado>("/admin/xcontact/probe", { method: "POST", body: JSON.stringify(f) })); }
    catch (e) { setError((e as Error).message); } finally { setProbando(false); }
  }
  async function guardarInstancia() {
    if (!clienteId) { setError("Elegí un cliente para guardar la instancia"); return; }
    try {
      await apiFetch(`/admin/clientes/${clienteId}/xcontact/instancias`, { method: "POST", body: JSON.stringify({
        nombre: nombreInst.trim() || "XContact", host: f.host, versionApi: "v5", usuario: f.usuario, credencialRef: credRef.trim() || null, resumen: res?.resumen,
      }) });
      flash("Instancia guardada"); cargarInstancias(clienteId);
    } catch (e) { setError((e as Error).message); }
  }
  function cargarInstancia(i: Instancia) { setF({ host: i.host, usuario: i.usuario ?? "", password: "", apiKey: "" }); setNombreInst(i.nombre); setCredRef(i.credencial_ref ?? ""); setRes(null); flash("Config cargada — poné la clave y probá"); }
  async function sincronizar(i: Instancia) {
    if (!f.password) { setError("Poné la contraseña del supervisor (arriba) para sincronizar"); return; }
    setSincronizando(i.id); setError(null);
    try {
      const r = await apiFetch<{ leidos: number; personas: number; interacciones: number }>(`/admin/clientes/${clienteId}/xcontact/instancias/${i.id}/sincronizar`, { method: "POST", body: JSON.stringify({ password: f.password, limite: 25 }) });
      flash(`Sincronizados ${r.leidos} contactos: ${r.personas} personas, ${r.interacciones} interacciones`); cargarInstancias(clienteId);
    } catch (e) { setError((e as Error).message); } finally { setSincronizando(""); }
  }
  async function borrarInstancia(i: Instancia) { try { await apiFetch(`/admin/clientes/${clienteId}/xcontact/instancias/${i.id}`, { method: "DELETE" }); cargarInstancias(clienteId); } catch (e) { setError((e as Error).message); } }

  const R = res?.resumen;
  const chip = (l: string, v: boolean) => <Badge key={l} rol={v ? "exito" : "critico"}><Icon name={v ? "check" : "x"} className="xhub-inline-icon" /> {l}</Badge>;

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-xcontact-page">
        <div className="xhub-page-heading" data-hero="integration">
          <div><Link href="/superadmin" className="xhub-eyebrow inline-flex items-center gap-2"><Icon name="arrow-left" /> PLATAFORMA · INTEGRACIONES</Link><h1>XContact</h1><p>Conecta tu atención. Comprueba cada instancia y sus capacidades.</p><HeroFeatures variant="xcontact" />
          </div>
          <Link href="/superadmin/salud-xcontact" className="voxia-button-primary inline-flex items-center gap-2"><Icon name="pulse" weight="regular" /> Ver salud de la flota</Link>
        </div>
        <p className="xhub-platform-description"><Icon name="info" weight="regular" /> Test de conectividad y capacidades: login v5 + refresh, lecturas v5 (colas, IVR, contactos, config), REST v4/v2 con api_key, swagger y bridge AMI. Guarda la instancia por cliente para volver a usarla.</p>

        {/* Cliente + instancias guardadas */}
        <Card className="mb-4"><CardContent className="pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="xcontact-cliente" className="xhub-section-heading"><Icon name="building-office" weight="regular" /> Cliente</label>
            <select id="xcontact-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-[13px] min-w-[200px]">
              <option value="">— elegí un cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {clienteId && (
            instancias.length === 0
              ? <div className="text-[12.5px] text-muted-foreground mt-3">Sin instancias guardadas. Probá abajo y guardá la que funcione.</div>
              : <div className="mt-3 space-y-2">
                  {instancias.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 flex-wrap">
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium">{i.nombre}</span>
                        <Badge rol={ESTADO_ROL[i.estado_salud] ?? "neutro"} className="ml-2">{i.estado_salud}</Badge>
                        <div className="text-[11px] text-muted-foreground font-mono">{i.host} · {i.version_api}{i.usuario ? ` · ${i.usuario}` : ""}{i.ultima_prueba ? ` · probada ${i.ultima_prueba.slice(0, 16).replace("T", " ")}` : ""}</div>
                      </div>
                      <div className="xhub-platform-actions flex gap-3 items-center flex-wrap">
                        <button onClick={() => sincronizar(i)} disabled={sincronizando === i.id} className="text-[12px] text-[hsl(var(--exito))] hover:underline disabled:opacity-50"><Icon name="arrows-clockwise" className="xhub-inline-icon" weight="regular" /> {sincronizando === i.id ? "sincronizando…" : "sincronizar contactos"}</button>
                        <button onClick={() => cargarInstancia(i)} className="text-[12px] text-[hsl(var(--senal))] hover:underline">cargar</button>
                        <button onClick={() => borrarInstancia(i)} className="text-[12px] text-muted-foreground hover:text-[hsl(var(--critico))]">borrar</button>
                      </div>
                    </div>
                  ))}
                </div>
          )}
        </CardContent></Card>

        {/* Formulario de prueba */}
        <Card className="mb-5"><CardContent className="pt-5 xhub-probe-form">
          <label className="flex flex-col flex-1 min-w-[150px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Host XContact</span><Input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="x5.xcontact.cl" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Supervisor</span><Input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} className="mt-1 w-32" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contraseña</span><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1 w-36" /></label>
          <label className="flex flex-col flex-1 min-w-[160px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">API key REST (v4/v2)</span><Input value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder="opcional — lectura v4" className="mt-1" /></label>
          <Button onClick={probar} disabled={probando || f.host.trim().length < 3}><Icon name={probando ? "spinner-gap" : "plugs-connected"} weight="regular" />{probando ? "Probando…" : "Probar conexión"}</Button>
        </CardContent></Card>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}
        {msg && <div className="mb-4 p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" weight="regular" /> {msg}</div>}

        {R && (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              {chip("Alcanzable", !!R.alcanzable)}
              {chip("Login v5", !!R.login)}
              {chip("Refresh", !!R.refresh)}
              {chip("Lee colas", !!R.puedeLeerColas)}
              {chip("Lee contactos", !!R.puedeLeerContactos)}
              {chip("Lee campañas", !!R.puedeLeerCampanas)}
              {chip("api_key REST", !!R.apiKeyRest)}
              {chip("Swagger v4", !!R.swaggerV4)}
              {chip("AMI", !!R.ami)}
            </div>
            <div className="flex gap-3 flex-wrap mb-4 text-[12px] text-muted-foreground">
              <span>Lecturas v5: <b className="text-foreground tabular-nums">{Number(R.lecturasV5)}/9</b></span>
              <span>Checks OK: <b className="text-foreground tabular-nums">{Number(R.checksOk)}/{Number(R.checksTotal)}</b></span>
            </div>

            {clienteId && (
              <Card className="mb-4" style={{ borderColor: "hsl(var(--senal)/0.4)" }}><CardContent className="pt-4 flex gap-2 items-end flex-wrap">
                <label className="flex flex-col flex-1 min-w-[160px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre de la instancia</span><Input value={nombreInst} onChange={(e) => setNombreInst(e.target.value)} className="mt-1" /></label>
                <label className="flex flex-col flex-1 min-w-[160px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Credencial (env var, no el secreto)</span><Input value={credRef} onChange={(e) => setCredRef(e.target.value)} placeholder="XCONTACT_X5_PASS" className="mt-1" /></label>
                <Button variant="secondary" onClick={guardarInstancia}>Guardar para {clientes.find((c) => c.id === clienteId)?.nombre}</Button>
              </CardContent></Card>
            )}

            <Card><CardContent className="pt-5">
              <div className="space-y-0">
                {res!.checks.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-t border-border first:border-t-0">
                    <span className="xhub-probe-result" data-ok={c.ok}><Icon name={c.ok ? "check-circle" : "warning-circle"} weight="regular" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium">{c.nombre} {c.nota && <span className="text-[11px] font-normal text-muted-foreground">· {c.nota}</span>}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{c.detalle}</div>
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{c.ms}ms</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
            <p className="text-[12px] text-muted-foreground mt-3">La lectura AMI en vivo requiere presencia (socket.io); un ✗ ahí es esperado desde un test REST. Para el conector lo clave es login v5 + lecturas + (si hay api_key) REST v4.</p>
          </>
        )}
      </div>
    </main>
  );
}
