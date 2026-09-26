"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";

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

  const togglePermiso = (u: Usuario, clave: string) => accion(async () => {
    const tiene = u.permisos.includes(clave);
    const permisos = tiene ? u.permisos.filter((x) => x !== clave) : [...u.permisos, clave];
    setData((d) => d && { ...d, usuarios: d.usuarios.map((x) => x.id === u.id ? { ...x, permisos } : x) });
    await apiFetch(`/cliente/usuarios/${u.id}/permisos`, { method: "PUT", body: JSON.stringify({ permisos }) });
  }, "Permisos actualizados");

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
      <div className="max-w-3xl mx-auto p-4 sm:p-8 flex flex-col gap-5">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mi equipo</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Crea usuarios y decide qué puede hacer cada uno.</p>
          </div>
          {data && <Badge rol={lleno ? "aviso" : "senal"}>{data.usados} / {data.limite} usuarios</Badge>}
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}>▲ {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}>✓ {msg}</div>}

        {/* Lista del equipo con permisos por usuario */}
        {data?.usuarios.map((u) => (
          <Card key={u.id}><CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-9 w-9 rounded-full grid place-items-center text-xs font-semibold bg-secondary shrink-0">
                {(u.nombre || u.email).split(/[ @.]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium truncate">{u.nombre || u.email}</div>
                <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
              </div>
              <Badge rol={u.rol === "admin_cliente" ? "senal" : "neutro"}>{u.rol === "admin_cliente" ? "Admin" : "Usuario"}</Badge>
            </div>
            {u.rol === "admin_cliente" ? (
              <p className="text-[12px] text-muted-foreground">El administrador tiene acceso completo a los módulos del cliente.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {catalogo.map((p) => {
                  const on = u.permisos.includes(p.clave);
                  return (
                    <button key={p.clave} onClick={() => togglePermiso(u, p.clave)}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-secondary/50 transition">
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
              </div>
            )}
          </CardContent></Card>
        ))}

        {/* Alta de un usuario del equipo */}
        <Card><CardContent className="pt-5">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Nuevo usuario</div>
          {lleno ? (
            <div className="text-[12px] rounded-md px-3 py-2" style={{ background: "hsl(var(--aviso)/0.1)", color: "hsl(var(--aviso))" }}>
              Alcanzaste tu tope de {data?.limite} usuarios. Pídele a la plataforma que lo suba.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input value={nu.nombre} onChange={(e) => setNu({ ...nu, nombre: e.target.value })} placeholder="Nombre" className="sm:flex-1" />
                <Input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="Email" className="sm:flex-1" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="Contraseña (mín. 10)" className="sm:flex-1" />
                <Button onClick={crear} disabled={creando || nu.email.length < 3 || nu.password.length < 10 || nu.nombre.length < 2}>Crear usuario</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Podrás darle permisos apenas se cree.</p>
            </div>
          )}
        </CardContent></Card>
      </div>
    </main>
  );
}
