import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const eventos = [
  { actor: "services@voxtilabs.cl", accion: "cliente.modulo_encendido", recurso: "Retail Andes · xCRM", resultado: "ok" as const, cuando: "10:44" },
  { actor: "api:xhub_a1B2", accion: "persona.creada", recurso: "juan@empresa.cl", resultado: "ok" as const, cuando: "10:42" },
  { actor: "vendedor@retail.cl", accion: "persona.exportar", recurso: "—", resultado: "denegado" as const, cuando: "10:30" },
];
const rol = (r: string) => (r === "ok" ? "exito" : "accion") as "exito" | "accion";

export default function Auditoria() {
  return (
    <main className="min-h-screen">
      <header className="flex flex-wrap items-center gap-2 px-4 sm:px-8 py-4 sm:py-5 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
        <span className="font-semibold text-lg tracking-tight">xHub</span>
        <span className="ml-2 text-[0.65rem] font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))] border border-border rounded-pill px-2 py-0.5">Superadmin · X5</span>
      </header>
      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--exito))]">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--exito))]" /> Cadena de hashes íntegra
          </div>
        </div>
        <div className="max-w-xs"><Input placeholder="Buscar por actor, acción o recurso…" /></div>
        <Card><CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Hora</TableHead><TableHead>Actor</TableHead><TableHead>Acción</TableHead><TableHead>Recurso</TableHead><TableHead>Resultado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {eventos.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground tabular-nums">{e.cuando}</TableCell>
                  <TableCell className="font-mono text-xs">{e.actor}</TableCell>
                  <TableCell className="font-mono text-xs">{e.accion}</TableCell>
                  <TableCell>{e.recurso}</TableCell>
                  <TableCell><Badge rol={rol(e.resultado)}>{e.resultado}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </main>
  );
}
