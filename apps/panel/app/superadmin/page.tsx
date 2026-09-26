import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
type Estado = "activo" | "moroso" | "en_alta";
const rolDeEstado = (e: Estado): "exito" | "senal" | "accion" | "neutro" =>
  e === "activo" ? "exito" : e === "en_alta" ? "senal" : "accion";
const pct = (u: number, c: number) => (c <= 0 ? 0 : Math.min(100, Math.round((u / c) * 100)));
const clientes = [
  { nombre: "Retail Andes SpA", estado: "activo" as Estado, modulos: ["tickets", "crm"], uso: 4210, cuota: 50000 },
  { nombre: "Clínica Costanera", estado: "activo" as Estado, modulos: ["tickets"], uso: 9100, cuota: 10000 },
  { nombre: "Automotriz del Sur", estado: "moroso" as Estado, modulos: ["crm"], uso: 0, cuota: 10000 },
];
export default function Superadmin() {
  const activos = clientes.filter((c) => c.estado === "activo").length;
  const enAlerta = clientes.filter((c) => pct(c.uso, c.cuota) >= 80).length;
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-2 px-8 py-5 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
        <span className="font-semibold text-lg tracking-tight">xHub</span>
        <span className="ml-2 text-[0.65rem] font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5">Superadmin · X5</span>
      </header>
      <div className="max-w-5xl mx-auto p-8">
        <div className="flex gap-4 mb-8 flex-wrap">
          {([["Clientes", clientes.length], ["Activos", activos], ["En alerta de cuota", enAlerta]] as const).map(([l, n]) => (
            <Card key={l} className="flex-1 min-w-[180px]">
              <CardContent className="pt-6">
                <div className="text-xs font-black tracking-widest uppercase text-[hsl(var(--senal))]">{l}</div>
                <div className="text-4xl font-semibold tracking-tight mt-1">{n}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg tracking-tight">Clientes</h2>
          <Button size="sm">+ Crear cliente</Button>
        </div>
        <Card><CardContent className="pt-6 overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs font-black tracking-widest uppercase text-muted-foreground">
              <th className="pb-3">Cliente</th><th className="pb-3">Estado</th><th className="pb-3">Módulos</th><th className="pb-3">Consumo API (mes)</th>
            </tr></thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.nombre} className="border-t border-border">
                  <td className="py-4">{c.nombre}</td>
                  <td className="py-4"><Badge rol={rolDeEstado(c.estado)}>{c.estado}</Badge></td>
                  <td className="py-4">{c.modulos.map((m) => (
                    <span key={m} className="inline-block text-xs text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5 mr-1">{m}</span>
                  ))}</td>
                  <td className="py-4 tabular-nums">{c.uso.toLocaleString("es-CL")} / {c.cuota.toLocaleString("es-CL")}
                    <div className="h-1.5 w-32 bg-secondary rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct(c.uso, c.cuota)}%`, background: pct(c.uso, c.cuota) >= 80 ? "hsl(var(--primary))" : "hsl(var(--senal))" }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </main>
  );
}
