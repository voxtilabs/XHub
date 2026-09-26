import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const entregas = [
  { evento: "ticket.creado", url: "cliente.cl/hook", estado: "entregado" as const, codigo: 200, cuando: "10:42:03" },
  { evento: "persona.fusionada", url: "cliente.cl/hook", estado: "entregado" as const, codigo: 200, cuando: "10:15:44" },
  { evento: "ticket.creado", url: "cliente.cl/hook", estado: "fallido" as const, codigo: 503, cuando: "09:58:12" },
];
const rol = (e: string) => (e === "entregado" ? "exito" : e === "fallido" ? "accion" : "senal") as "exito" | "accion" | "senal";

export default function Webhooks() {
  return (
    <main className="min-h-screen">
      <header className="flex flex-wrap items-center gap-2 px-4 sm:px-8 py-4 sm:py-5 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
        <span className="font-semibold text-lg tracking-tight">xHub</span>
      </header>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <Button size="sm">+ Nuevo webhook</Button>
        </div>
        <Card>
          <CardHeader><CardTitle>Endpoint</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm">https://cliente.cl/hook</div>
              <div className="flex gap-2">
                <Badge rol="senal">ticket.creado</Badge><Badge rol="senal">persona.fusionada</Badge>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <span className="font-mono text-xs text-muted-foreground">whsec_a1B2…9zX</span>
              <Button variant="ghost" size="sm">Rotar secreto</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Entregas recientes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Evento</TableHead><TableHead>Estado</TableHead><TableHead>Código</TableHead><TableHead>Hora</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {entregas.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{e.evento}</TableCell>
                    <TableCell><Badge rol={rol(e.estado)}>{e.estado}</Badge></TableCell>
                    <TableCell className="tabular-nums">{e.codigo}</TableCell>
                    <TableCell className="text-muted-foreground">{e.cuando}</TableCell>
                    <TableCell>{e.estado === "fallido" && <Button variant="ghost" size="sm">Reintentar</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
