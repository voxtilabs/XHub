"use client";
import { Icon } from "@/components/icon";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { useYo } from "@/lib/permisos";

type Regla = { id: string; nombre: string; evento: string; condicion: Record<string, unknown>; accion: Record<string, unknown>; moduloDestino?: string | null; activa: boolean };
type Plantilla = { clave: string; nombre: string; evento: string; moduloDestino?: string | null; condicion: Record<string, unknown>; accion: Record<string, unknown>; descripcion: string };

const EVENTOS: Record<string, string> = { "ticket.creado": "Cuando entra un ticket" };
const ACCIONES: Record<string, string> = { crear_oportunidad: "Registrarlo en el CRM", registrar_nota: "Dejar una nota en la persona" };

export default function Automatizaciones() {
  const { yo } = useYo();
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, { evaluados: number; afectados: number }>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      const [r, p] = await Promise.all([
        apiFetch<{ datos: Regla[] }>("/cliente/reglas"),
        apiFetch<{ datos: Plantilla[] }>("/cliente/reglas/plantillas"),
      ]);
      setReglas(r.datos); setPlantillas(p.datos);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { cargar(); }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2400); };
  async function accion(clave: string, fn: () => Promise<void>, ok: string) {
    setError(null); setOcupado(clave);
    try { await fn(); flash(ok); } catch (e) { setError((e as Error).message); } finally { setOcupado(null); }
  }

  const modulos = yo?.modulos ?? [];
  const moduloApagado = (m?: string | null) => !!m && !modulos.includes(m);

  const activar = (r: Regla, activa: boolean) => accion(r.id, async () => {
    setReglas((xs) => xs.map((x) => x.id === r.id ? { ...x, activa } : x));
    try { await apiFetch(`/cliente/reglas/${r.id}/activar`, { method: "PUT", body: JSON.stringify({ activa }) }); }
    catch (e) { setReglas((xs) => xs.map((x) => x.id === r.id ? { ...x, activa: !activa } : x)); throw e; }
  }, activa ? "Automatización activada" : "Automatización pausada");

  const verPreview = (r: Regla) => accion("prev-" + r.id, async () => {
    const p = await apiFetch<{ evaluados: number; afectados: number }>(`/cliente/reglas/${r.id}/preview`);
    setPreview((x) => ({ ...x, [r.id]: p }));
  }, "Vista previa calculada");

  const activarPlantilla = (pl: Plantilla) => accion("pl-" + pl.clave, async () => {
    await apiFetch("/cliente/reglas", { method: "POST", body: JSON.stringify({ plantilla: pl.clave }) });
    await cargar();
  }, "Automatización creada (queda apagada)");

  const yaCreada = (pl: Plantilla) => reglas.some((r) => r.nombre === pl.nombre);
  const describir = (r: Regla | Plantilla) => {
    const ev = EVENTOS[r.evento] ?? r.evento;
    const ac = ACCIONES[(r.accion?.tipo as string)] ?? (r.accion?.tipo as string);
    const cond = r.condicion ?? {};
    const filtro = (cond as Record<string, unknown>).prioridad ? ` de prioridad ${(cond as Record<string, unknown>).prioridad}` : "";
    return `${ev}${filtro} → ${ac}`;
  };

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page">
        <div className="xhub-page-heading">
          <div>
            <div className="xhub-eyebrow">ADMINISTRACIÓN DEL ESPACIO</div>
            <h1>Automatizaciones</h1>
            <p>Reglas que conectan tus módulos: cuando pasa algo en un ticket, xHub reacciona solo. Nacen apagadas y puedes ver a quién afectarían antes de encenderlas.</p>
          </div>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> {msg}</div>}

        <h2 className="xhub-section-heading">Tus automatizaciones</h2>
        {reglas.length === 0 && <Card className="p-6 text-sm text-muted-foreground">Aún no tienes automatizaciones. Activa una plantilla más abajo para empezar.</Card>}
        {reglas.map((r) => {
          const apagado = moduloApagado(r.moduloDestino);
          const pv = preview[r.id];
          return (
            <Card key={r.id} className="mb-2"><CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-semibold">{r.nombre}</h3>
                    {r.activa && !apagado && <Badge rol="senal">Activa</Badge>}
                    {r.activa && apagado && <Badge rol="neutro">Pausada · módulo apagado</Badge>}
                    {!r.activa && <Badge rol="neutro">Apagada</Badge>}
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1">{describir(r)}</p>
                  {apagado && <p className="text-[12px] mt-1" style={{ color: "hsl(var(--aviso))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> Esta regla necesita el módulo <b>{r.moduloDestino}</b>, que está apagado. Queda en espera sin fallar.</p>}
                  {pv && <p className="text-[12px] mt-1 text-muted-foreground">Hoy afectaría a <b>{pv.afectados}</b> de {pv.evaluados} tickets abiertos que cumplen la condición.</p>}
                </div>
                <button type="button" role="switch" aria-checked={r.activa} aria-label={`Activar ${r.nombre}`} disabled={ocupado === r.id}
                  onClick={() => activar(r, !r.activa)}
                  className={"h-6 w-11 rounded-full relative transition shrink-0 " + (r.activa ? "bg-[hsl(var(--exito))]" : "bg-secondary border border-border")}>
                  <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all " + (r.activa ? "left-[22px]" : "left-0.5")} />
                </button>
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => verPreview(r)} disabled={ocupado === "prev-" + r.id} className="text-[12px] text-[hsl(var(--senal))] hover:underline">
                  {ocupado === "prev-" + r.id ? "calculando…" : "↻ ¿a quién afectaría hoy?"}
                </button>
              </div>
            </CardContent></Card>
          );
        })}

        <h2 className="xhub-section-heading mt-6">Plantillas</h2>
        <p className="text-[13px] text-muted-foreground mb-2">Automatizaciones listas para usar. Al activarlas se crean apagadas: enciéndelas cuando quieras.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {plantillas.map((pl) => {
            const creada = yaCreada(pl);
            const apagado = moduloApagado(pl.moduloDestino);
            return (
              <Card key={pl.clave}><CardContent className="pt-5">
                <h3 className="text-[15px] font-semibold">{pl.nombre}</h3>
                <p className="text-[13px] text-muted-foreground mt-1">{pl.descripcion}</p>
                <p className="text-[12px] text-muted-foreground mt-1 font-mono">{describir(pl)}</p>
                {apagado && <p className="text-[12px] mt-1" style={{ color: "hsl(var(--aviso))" }}>Requiere el módulo <b>{pl.moduloDestino}</b> (apagado). Puedes crearla igual; quedará en espera.</p>}
                <div className="mt-3">
                  <Button size="sm" variant={creada ? "outline" : "default"} disabled={creada || ocupado === "pl-" + pl.clave} onClick={() => activarPlantilla(pl)}>
                    {creada ? "Ya la tienes" : ocupado === "pl-" + pl.clave ? "creando…" : "Crear automatización"}
                  </Button>
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
