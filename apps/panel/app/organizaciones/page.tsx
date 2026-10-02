"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { RequierePermiso } from "@/components/requiere-permiso";
import { getOrganizaciones, crearOrganizacion, type Organizacion } from "@/lib/crm";
import { HeroFeatures } from "@/components/hero-features";

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
    <div className="xhub-page xhub-crm-page crm-organizaciones-page">
      <div className="xhub-page-heading" data-hero="commerce">
        <div>
          <div className="xhub-eyebrow">RELACIONES COMERCIALES</div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{cargando ? "cargando…" : `${orgs.length} organizaciones`}</p>
        <HeroFeatures variant="organizaciones" />
          </div>
        <Button size="sm" onClick={() => setNuevo((v) => !v)}><Icon name={nuevo ? "x" : "plus"} weight="regular" />{nuevo ? "Cerrar" : "Nueva empresa"}</Button>
      </div>

      {error && <div role="alert" className="crm-error mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" weight="regular" /> {error}</div>}

      {nuevo && (
        <Card className="crm-form-card mb-5"><CardContent className="crm-create-form pt-5">
          <label className="flex flex-col flex-1 min-w-[150px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</span><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Inmobiliaria Andes SpA" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[130px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rubro</span><Input value={f.rubro} onChange={(e) => setF({ ...f, rubro: e.target.value })} placeholder="Inmobiliaria" className="mt-1" /></label>
          <label className="flex flex-col flex-1 min-w-[130px]"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sitio web</span><Input value={f.sitioWeb} onChange={(e) => setF({ ...f, sitioWeb: e.target.value })} placeholder="andes.cl" className="mt-1" /></label>
          <label className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teléfono</span><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className="mt-1 w-36" /></label>
          <Button onClick={crear}>Crear</Button>
        </CardContent></Card>
      )}

      {cargando && <div className="crm-loading" role="status"><Icon name="spinner-gap" />Cargando empresas…</div>}
      {orgs.length === 0 && !cargando ? (
        <Card><CardContent className="crm-empty py-12 text-center text-muted-foreground text-sm"><Icon name="buildings" weight="duotone" />Aún no hay empresas. Crea la primera para reunir sus oportunidades.</CardContent></Card>
      ) : (
        <div className="crm-record-list">
          {orgs.map((g) => (
            <Card key={g.id} className="crm-record-card"><CardContent className="crm-record-row">
              <span className="crm-record-icon"><Icon name="buildings" weight="duotone" /></span>
              <div className="min-w-0">
                <div className="crm-record-title">{g.nombre}</div>
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
