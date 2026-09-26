"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

// Detalle de un cliente: encender/apagar módulos y ver su API. Patrón blocks.so
// "settings" sobre shadcn, tematizado Consola X5.
const MODULOS = [
  { id: "tickets", nombre: "xTickets", desc: "Gestión de tickets tipo Zendesk" },
  { id: "crm", nombre: "xCRM", desc: "Embudos, oportunidades y actividades" },
];

export default function ClienteDetalle() {
  const [encendidos, setEncendidos] = useState<Record<string, boolean>>({ tickets: true, crm: false });
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 px-8 py-5 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
        <span className="font-semibold text-lg tracking-tight">xHub</span>
        <span className="ml-2 text-[0.65rem] font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5">Superadmin · X5</span>
      </header>
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Retail Andes SpA</h1>
            <div className="flex items-center gap-2 mt-1"><Badge rol="exito">activo</Badge>
              <span className="text-sm text-muted-foreground">Plan Crece · 50.000 llamadas/mes</span></div>
          </div>
          <Button variant="secondary" size="sm">Entrar en modo soporte</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Módulos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {MODULOS.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-t border-border first:border-t-0">
                <div><div className="font-medium">{m.nombre}</div><div className="text-sm text-muted-foreground">{m.desc}</div></div>
                <Switch checked={!!encendidos[m.id]} onCheckedChange={(v) => setEncendidos((e) => ({ ...e, [m.id]: v }))} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">Encender un módulo no migra datos: la historia de cada persona ya vive en el núcleo.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>API del cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div><div className="font-mono text-sm">xhub_a1B2…9zX</div><div className="text-xs text-muted-foreground">Integración ERP · último uso hace 3 min</div></div>
              <Button variant="ghost" size="sm">Revocar</Button>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Consumo del mes</div>
              <div className="text-sm tabular-nums">4.210 / 50.000</div>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[hsl(var(--senal))]" style={{ width: "8%" }} />
            </div>
            <Button size="sm">+ Nueva llave</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
