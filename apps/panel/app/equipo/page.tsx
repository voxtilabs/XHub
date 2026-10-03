"use client";
import { Icon } from "@/components/icon";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { HeroFeatures } from "@/components/hero-features";

type Permiso = { clave: string; nombre: string; descripcion: string; modulo: string };
type Usuario = { id: string; email: string; nombre: string; rol: string; permisos: string[] };
type Data = { limite: number; usados: number; usuarios: Usuario[] };

export default function Equipo() {
  const [data, setData] = useState<Data | null>(null);
  const [catalogo, setCatalogo] = useState<Permiso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nu, setNu] = useState({ email: "", nombre: "", password: "" });
  const [creando, setCreando] = useState(false);
  const [claveTmp, setClaveTmp] = useState<{ id: string; clave: string } | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      const [u, p] = await Promise.all([
        apiFetch<Data>("/cliente/usuarios"),
        apiFetch<{ datos: Permiso[] }>("/cliente/permisos"),
      ]);
      setData(u); setCatalogo(p.datos);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { cargar(); }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2200); };
  async function accion(fn: () => Promise<void>, ok: string) {
    setError(null);
    try { await fn(); flash(ok); } catch (e) { setError((e as Error).message); }
  }

  const fijarPermisos = (u: Usuario, permisos: string[]) => accion(async () => {
    const previo = u.permisos;
    setData((d) => d && { ...d, usuarios: d.usuarios.map((x) => x.id === u.id ? { ...x, permisos } : x) });
    try { await apiFetch(`/cliente/usuarios/${u.id}/permisos`, { method: "PUT", body: JSON.stringify({ permisos }) }); }
    catch (e) { setData((d) => d && { ...d, usuarios: d.usuarios.map((x) => x.id === u.id ? { ...x, permisos: previo } : x) }); throw e; }
  }, "Permisos guardados");
  const togglePermiso = (u: Usuario, clave: string) => {
    const permisos = u.permisos.includes(clave) ? u.permisos.filter((x) => x !== clave) : [...u.permisos, clave];
    return fijarPermisos(u, permisos);
  };
  const resetClave = (u: Usuario) => accion(async () => {
    const r = await apiFetch<{ clave: string }>(`/cliente/usuarios/${u.id}/reset-clave`, { method: "PUT" });
    setClaveTmp({ id: u.id, clave: r.clave });
  }, "Clave temporal generada");
  // Confirmación INLINE (sin confirm() nativo, que algunos navegadores bloquean).
  const eliminarUsuario = (u: Usuario) => accion(async () => {
    setConfirmarEliminar(null);
    await apiFetch(`/cliente/usuarios/${u.id}`, { method: "DELETE" });
    setData((d) => d && { ...d, usados: d.usados - 1, usuarios: d.usuarios.filter((x) => x.id !== u.id) });
  }, "Usuario eliminado");
  const PLANTILLAS: { n: string; permisos: string[] }[] = [
    { n: "Agente soporte", permisos: ["bandeja.ver", "bandeja.gestionar", "ficha360.ver", "personas.buscar"] },
    { n: "Vendedor CRM", permisos: ["crm.ver", "crm.gestionar", "ficha360.ver", "personas.buscar"] },
    { n: "Solo lectura", permisos: ["bandeja.ver", "crm.ver", "ficha360.ver"] },
    { n: "Todo", permisos: catalogo.map((p) => p.clave) },
    { n: "Ninguno", permisos: [] },
  ];

  const crear = () => accion(async () => {
    setCreando(true);
    try {
      await apiFetch("/cliente/usuarios", { method: "POST", body: JSON.stringify(nu) });
      setNu({ email: "", nombre: "", password: "" }); await cargar();
    } finally { setCreando(false); }
  }, "Usuario creado");

  const lleno = data ? data.usados >= data.limite : false;

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-team-page">
        <div className="xhub-page-heading" data-hero="people">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DEL ESPACIO</div>
            <h1>Mi equipo</h1>
            <p>Crea usuarios y decide qué puede hacer cada uno.</p>
          <HeroFeatures variant="equipo" />
          </div>
          <Button asChild size="sm"><a href="#nuevo-usuario"><Icon name="user-plus" /> Nuevo usuario</a></Button>
        </div>

        {data && <div className="xhub-capacity">
          <Icon name="users-three" />
          <div className="xhub-capacity-copy"><strong>{data.usados} miembros en tu equipo</strong><p>{lleno ? "Has alcanzado el límite de usuarios." : `${data.limite - data.usados} lugares disponibles de ${data.limite}.`}</p></div>
          <div className="xhub-capacity-meter">
            <div className="xhub-capacity-meter-label"><span>Capacidad utilizada</span><strong>{data.usados}<span> / {data.limite}</span></strong></div>
            <div className="xhub-capacity-track" role="meter" aria-label="Usuarios utilizados" aria-valuenow={data.usados} aria-valuemin={0} aria-valuemax={data.limite}><span style={{ width: `${Math.min(100, data.limite > 0 ? data.usados / data.limite * 100 : 0)}%` }} /></div>
          </div>
        </div>}

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> {msg}</div>}

        <div className="xhub-team-section-head">
          <h2 className="xhub-section-heading">Miembros y permisos</h2>
          {data && <span className="xhub-team-count">{data.usuarios.length} {data.usuarios.length === 1 ? "miembro" : "miembros"}</span>}
        </div>
        <div className="xhub-team-layout">
        <div className="xhub-team-members">
        {!data && !error && <Card className="p-6 text-sm text-muted-foreground" role="status">Cargando tu equipo…</Card>}
        {data?.usuarios.length === 0 && <Card className="p-6 text-sm text-muted-foreground">Tu equipo aún no tiene miembros.</Card>}
        {data?.usuarios.map((u) => (
          <Card key={u.id} className="xhub-team-card" data-member-role={u.rol}><CardContent className="xhub-team-card-content">
            <div className="xhub-team-member-head">
              <span className="xhub-team-avatar">
                {(u.nombre || u.email).split(/[ @.]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h3>{u.nombre || u.email}</h3>
                <p>{u.email}</p>
              </div>
              <Badge className="xhub-team-role" rol={u.rol === "admin_cliente" ? "accion" : "neutro"}>{u.rol === "admin_cliente" ? "Admin" : "Usuario"}</Badge>
            </div>
            {u.rol === "admin_cliente" ? (
              <p className="xhub-context-note xhub-team-admin-note"><Icon name="shield-check" />Acceso completo a los módulos y la administración del equipo.</p>
            ) : (
              <details className="xhub-team-permissions"><summary><span className="xhub-team-permission-title"><Icon name="shield-check" />Gestionar permisos</span><span className="xhub-team-permission-count">{u.permisos.length} habilitados</span><Icon name="caret-down" /></summary><div className="xhub-team-permission-grid">
                {catalogo.map((p) => {
                  const on = u.permisos.includes(p.clave);
                  return (
                    <button key={p.clave} type="button" role="switch" aria-checked={on} aria-label={`${p.nombre} · ${u.nombre || u.email}`} onClick={() => togglePermiso(u, p.clave)}
                      className="xhub-team-permission-option flex items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-secondary/50 transition">
                      <span className={"h-5 w-9 rounded-full relative transition shrink-0 " + (on ? "bg-[hsl(var(--exito))]" : "bg-secondary border border-border")}>
                        <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " + (on ? "left-[18px]" : "left-0.5")} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{p.nombre}</span>
                        <span className="block text-[11px] text-muted-foreground">{p.descripcion}</span>
                      </span>
                    </button>
                  );
                })}
              </div></details>
            )}
            {u.rol !== "admin_cliente" && (
              <div className="xhub-team-presets">
                <span className="text-[10.5px] uppercase tracking-widest text-muted-foreground mr-1">Plantilla:</span>
                {PLANTILLAS.map((pl) => (
                  <button key={pl.n} type="button" onClick={() => fijarPermisos(u, pl.permisos)}
                    className="text-[11px] px-2 py-0.5 rounded-pill border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(var(--senal))]">{pl.n}</button>
                ))}
              </div>
            )}
            {claveTmp?.id === u.id && (
              <div className="mt-2 p-2 rounded-md text-[12px]" style={{ background: "hsl(var(--senal)/0.1)" }}>
                Clave temporal (mostrala UNA vez): <b className="font-mono">{claveTmp.clave}</b> — pedile que la cambie al entrar.
              </div>
            )}
            <div className="xhub-team-actions">
              <button type="button" onClick={() => resetClave(u)} className="xhub-team-reset"><Icon name="arrows-clockwise" />Restablecer clave</button>
              {u.rol !== "admin_cliente" && (confirmarEliminar === u.id ? (
                <span className="xhub-team-delete-confirmation text-[12px] flex items-center gap-2">
                  <span className="text-muted-foreground">¿Eliminar?</span>
                  <button type="button" onClick={() => eliminarUsuario(u)} className="text-[hsl(var(--critico))] font-semibold hover:underline">Sí</button>
                  <button type="button" onClick={() => setConfirmarEliminar(null)} className="text-muted-foreground hover:underline">no</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmarEliminar(u.id)} className="xhub-team-delete"><Icon name="x" />Eliminar</button>
              ))}
            </div>
          </CardContent></Card>
        ))}
        </div>

        {/* Alta de un usuario del equipo */}
        <Card className="xhub-team-form" id="nuevo-usuario">
          <h2 className="xhub-section-heading"><Icon name="user-plus" /> Nuevo usuario</h2>
          <p>Suma una persona al equipo y configura sus accesos.</p>
          {lleno ? (
            <div className="text-[12px] rounded-md px-3 py-2" style={{ background: "hsl(var(--aviso)/0.1)", color: "hsl(var(--aviso))" }}>
              Alcanzaste tu tope de {data?.limite} usuarios. Pídele a la plataforma que lo suba.
            </div>
          ) : (
            <div className="xhub-team-form-fields">
                <label>Nombre completo<Input value={nu.nombre} onChange={(e) => setNu({ ...nu, nombre: e.target.value })} placeholder="Nombre y apellido" autoComplete="off" /></label>
                <label>Correo electrónico<Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="nombre@empresa.com" autoComplete="off" /></label>
                <label>Contraseña inicial<Input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="Al menos 10 caracteres" autoComplete="new-password" /><small>Elige una contraseña de 10 caracteres o más.</small></label>
                <Button onClick={crear} disabled={creando || nu.email.length < 3 || nu.password.length < 10 || nu.nombre.length < 2}><Icon name={creando ? "spinner-gap" : "user-plus"} className={creando ? "animate-spin" : ""} />Crear usuario</Button>
              <p className="text-[11px] text-muted-foreground">Podrás darle permisos apenas se cree.</p>
            </div>
          )}
        </Card>
        </div>
      </div>
    </main>
  );
}
