"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { HeroFeatures } from "@/components/hero-features";

type Resumen = Record<string, boolean | number>;
type Instancia = { id: string; nombre: string; host: string; version_api: string; estado_salud: string; ultima_prueba: string | null; resumen: Resumen | null; cliente_id: string | null; cliente: string | null;
  sondeo_activo?: boolean; ultimo_sondeo?: string | null; deriva?: number | null; deriva_reparada_en?: string | null; muertos?: number; fallos_consecutivos?: number; breaker_abierto?: boolean; ultima_causa?: string | null };
type Salud = { rollup: { total: number; operativas: number; parciales: number; caidas: number; sinProbar: number; general: string }; instancias: Instancia[] };

const ROL: Record<string, "exito" | "aviso" | "critico" | "neutro"> = { operativa: "exito", parcial: "aviso", degradada: "aviso", caida: "critico", sin_probar: "neutro", sin_instancias: "neutro" };
const GENERAL_TXT: Record<string, string> = { operativa: "Flota operativa", parcial: "Flota con avisos", caida: "Flota con caídas", sin_instancias: "Sin instancias registradas" };

export default function SaludXContact() {
  const [s, setS] = useState<Salud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = () => apiFetch<Salud>("/admin/xcontact/salud").then(setS).catch((e) => setError((e as Error).message));
  useEffect(() => { cargar(); }, []);

  const cap = (r: Resumen | null) => {
    if (!r) return [] as [string, boolean][];
    return ([["colas", !!r.puedeLeerColas], ["contactos", !!r.puedeLeerContactos], ["campañas", !!r.puedeLeerCampanas], ["api_key", !!r.apiKeyRest], ["AMI", !!r.ami]] as [string, boolean][]);
  };

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-fleet-page">
        <div className="xhub-page-heading" data-hero="integration" data-hero-size="long">
          <div><Link href="/superadmin" className="xhub-eyebrow inline-flex items-center gap-2"><Icon name="arrow-left" /> PLATAFORMA · MONITOREO</Link><h1>Salud XContact</h1><p>El estado de tus conexiones, siempre a la vista.</p><HeroFeatures variant="salud" />
          </div>
          <Link href="/superadmin/xcontact" className="voxia-button-primary inline-flex items-center gap-2"><Icon name="plugs-connected" weight="regular" /> Probar una instancia</Link>
        </div>
        <p className="xhub-platform-description"><Icon name="info" weight="regular" /> Cada instancia muestra su último scorecard. El estado general refleja la peor condición de la flota, incluidas las instancias sin probar.</p>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" weight="regular" /> {error}</div>}

        {s && (
          <>
            {/* Rollup */}
            <Card className="mb-5 xhub-fleet-summary"><CardContent className="pt-5">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge rol={ROL[s.rollup.general] ?? "neutro"}>{GENERAL_TXT[s.rollup.general] ?? s.rollup.general}</Badge>
                <span className="text-[13px] text-muted-foreground">
                  {s.rollup.total} instancia(s): <b className="text-[hsl(var(--exito))]">{s.rollup.operativas} operativas</b> · <b className="text-[hsl(var(--aviso))]">{s.rollup.parciales} con avisos</b> · <b className="text-[hsl(var(--critico))]">{s.rollup.caidas} caídas</b> · {s.rollup.sinProbar} sin probar
                </span>
              </div>
            </CardContent></Card>

            {s.instancias.length === 0 ? (
              <Card><CardContent className="pt-5 text-[13px] text-muted-foreground">Aún no hay instancias registradas. Andá a <Link href="/superadmin/xcontact" className="text-[hsl(var(--senal))]">Probar XContact</Link>, probá una y guardala por cliente.</CardContent></Card>
            ) : (
              <div className="xhub-fleet-grid">
                {s.instancias.map((i) => (
                  <Card key={i.id} className="xhub-fleet-card"><CardContent className="pt-4">
                    <span className="xhub-platform-glyph mb-4"><Icon name="plugs-connected" weight="regular" /></span>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-medium">{i.nombre}</span>
                          <Badge rol={ROL[i.estado_salud] ?? "neutro"}>{i.estado_salud}</Badge>
                          <span className="text-[11.5px] text-muted-foreground">{i.cliente ?? "compartida"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{i.host} · {i.version_api}{i.ultima_prueba ? ` · probada ${i.ultima_prueba.slice(0, 16).replace("T", " ")}` : " · nunca probada"}</div>
                      </div>
                      {typeof i.resumen?.lecturasV5 === "number" && (
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">v5: {Number(i.resumen.lecturasV5)}/9 · checks {Number(i.resumen.checksOk)}/{Number(i.resumen.checksTotal)}</span>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {cap(i.resumen).map(([l, v]) => (
                        <span key={l} className={"text-[10.5px] px-1.5 py-0.5 rounded " + (v ? "text-[hsl(var(--exito))]" : "text-muted-foreground")} style={v ? { background: "hsl(var(--exito)/0.1)" } : { background: "hsl(var(--secondary))" }}><Icon name={v ? "check" : "x"} className="xhub-inline-icon" /> {l}</span>
                      ))}
                      {!i.resumen && <span className="text-[11px] text-muted-foreground">sin scorecard — probá la instancia</span>}
                    </div>
                    {/* Capa de sincronización (#59/#61/#53): última sync, muertos, deriva, breaker. */}
                    <div className="flex gap-x-4 gap-y-1 flex-wrap mt-2 pt-2 border-t border-border text-[11.5px] text-muted-foreground tabular-nums">
                      <span>sondeo: <b className={i.sondeo_activo ? "text-[hsl(var(--exito))]" : ""}>{i.sondeo_activo ? "activo" : "apagado"}</b></span>
                      <span>última sync: {i.ultimo_sondeo ? i.ultimo_sondeo.slice(0, 16).replace("T", " ") : "—"}</span>
                      <span>deriva: <b className={i.deriva ? "text-[hsl(var(--aviso))]" : ""}>{i.deriva ?? "—"}</b></span>
                      <span>muertos: <b className={i.muertos ? "text-[hsl(var(--critico))]" : ""}>{i.muertos ?? 0}</b></span>
                      {i.breaker_abierto && <span className="text-[hsl(var(--critico))]">⛒ cortacircuitos abierto</span>}
                      {!i.breaker_abierto && (i.fallos_consecutivos ?? 0) > 0 && <span className="text-[hsl(var(--aviso))]">{i.fallos_consecutivos} fallo(s) seguidos</span>}
                    </div>
                    {i.ultima_causa && <div className="text-[11.5px] mt-1" style={{ color: "hsl(var(--critico))" }}>▲ {i.ultima_causa}</div>}
                  </CardContent></Card>
                ))}
              </div>
            )}
            <p className="text-[12px] text-muted-foreground mt-4">El tablero une el último <b>probe</b> de cada instancia con su capa de sincronización: última sync, cola de muertos, deriva y estado del cortacircuitos. <code className="font-mono">sin_probar</code> ensucia el estado general a propósito — no saber no es estar bien.</p>
          </>
        )}
      </div>
    </main>
  );
}
