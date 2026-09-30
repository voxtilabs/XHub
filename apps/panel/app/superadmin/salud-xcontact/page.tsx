"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Resumen = Record<string, boolean | number>;
type Instancia = { id: string; nombre: string; host: string; version_api: string; estado_salud: string; ultima_prueba: string | null; resumen: Resumen | null; cliente_id: string | null; cliente: string | null };
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
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <div className="flex items-center justify-between">
          <Link href="/superadmin" className="text-[13px] text-muted-foreground hover:text-foreground">← Clientes</Link>
          <Link href="/superadmin/xcontact"><Button size="sm" variant="secondary">Probar una instancia →</Button></Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-2 mb-1">Salud de la flota XContact</h1>
        <p className="text-muted-foreground text-sm mb-5">Estado de cada instancia registrada, con su último scorecard. El estado general es el peor de la flota: una caída o una instancia sin probar lo ensucia a propósito.</p>

        {error && <div className="mb-4 p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", color: "hsl(var(--critico))" }}>▲ {error}</div>}

        {s && (
          <>
            {/* Rollup */}
            <Card className="mb-5"><CardContent className="pt-5">
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
              <div className="space-y-2.5">
                {s.instancias.map((i) => (
                  <Card key={i.id}><CardContent className="pt-4">
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
                        <span key={l} className={"text-[10.5px] px-1.5 py-0.5 rounded " + (v ? "text-[hsl(var(--exito))]" : "text-muted-foreground")} style={v ? { background: "hsl(var(--exito)/0.1)" } : { background: "hsl(var(--secondary))" }}>{v ? "✓" : "✗"} {l}</span>
                      ))}
                      {!i.resumen && <span className="text-[11px] text-muted-foreground">sin scorecard — probá la instancia</span>}
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            )}
            <p className="text-[12px] text-muted-foreground mt-4">Pendiente de la capa de sincronización (#59): última sync exitosa, latencia p95, cola de muertos y deriva. Hoy el tablero refleja el último <b>probe</b> de cada instancia.</p>
          </>
        )}
      </div>
    </main>
  );
}
