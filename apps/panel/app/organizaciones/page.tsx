"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOrganizaciones, crearOrganizacion, type Organizacion } from "@/lib/crm";

const clp = (n: number) => "$" + n.toLocaleString("es-CL");

export default function Organizaciones() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <RequierePermiso permiso="crm.ver"><Contenido /></RequierePermiso>
    </main>
  );
}

function Contenido() {
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: "", sitioWeb: "", rubro: "", telefono: "" });

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setOrgs((await getOrganizaciones()).datos); } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear() {
    if (f.nombre.trim().length < 2) return;
    try { await crearOrganizacion({ nombre: f.nombre.trim(), sitioWeb: f.sitioWeb.trim() || undefined, rubro: f.rubro.trim() || undefined, telefono: f.telefono.trim() || undefined }); setF({ nombre: "", sitioWeb: "", rubro: "", telefono: "" }); setNuevo(false); await cargar(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{cargando ? "cargando…" : `${orgs.length} organizaciones`}</p>
        </div>
        <Button size="sm" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cerrar" : "+ Nueva empresa"}</Button>
      </div>

      {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

      {nuevo && (
        <Card className="mb-5"><CardContent className="pt-5 flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
          <label className="flex flex-col flex-1 min-w-[150px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</span><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Inmobiliaria Andes SpA" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[130px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rubro</span><Input value={f.rubro} onChange={(e) => setF({ ...f, rubro: e.target.value })} placeholder="Inmobiliaria" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[130px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sitio web</span><Input value={f.sitioWeb} onChange={(e) => setF({ ...f, sitioWeb: e.target.value })} placeholder="andes.cl" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teléfono</span><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className="mt-1 w-36" /></label>
          <Button onClick={crear}>Crear</Button>
        </CardContent></Card>
      )}

      {orgs.length === 0 && !cargando ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Aún no hay empresas. Crea la primera ↑</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {orgs.map((g) => (
            <Card key={g.id}><CardContent className="py-4 flex items-center gap-3 flex-wrap">
              <span className="h-9 w-9 rounded-md bg-secondary grid place-items-center text-sm">🏢</span>
              <div className="min-w-0">
                <div className="font-medium">{g.nombre}</div>
                <div className="text-[11.5px] text-muted-foreground">{[g.rubro, g.sitio_web, g.telefono].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="ml-auto text-right text-[12.5px]">
                <div className="tabular-nums font-medium">{g.deals ?? 0} deals</div>
                {(g.valor_abierto ?? 0) > 0 && <div className="text-[11px] text-[hsl(var(--senal))]">{clp(g.valor_abierto ?? 0)} abierto</div>}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
