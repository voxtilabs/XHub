import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/app-shell";

const timeline = [
  { tipo: "Ticket", modulo: "xTickets", resumen: "Abrió ticket: problema con despacho", cuando: "hoy 10:42" },
  { tipo: "Llamada", modulo: "xContact", resumen: "Llamada entrante · 4m 12s · atendida", cuando: "hoy 09:15" },
  { tipo: "WhatsApp", modulo: "xContact", resumen: "«Hola, consulta por mi pedido»", cuando: "ayer 18:30" },
  { tipo: "Email", modulo: "núcleo", resumen: "Se registró por correo", cuando: "12 sep" },
];
const identidades = [
  { canal: "teléfono", valor: "+56 9 1234 5678" },
  { canal: "email", valor: "juan.perez@empresa.cl" },
  { canal: "whatsapp", valor: "+56 9 1234 5678" },
];

export default function Persona() {
  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-lg font-semibold">JP</div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Juan Pérez</h1>
            <div className="flex gap-2 mt-1"><Badge rol="senal">Prospecto</Badge><Badge rol="accion">VIP</Badge></div>
          </div>
        </div>
        <Tabs defaultValue="historia">
          <TabsList>
            <TabsTrigger value="historia">Historia</TabsTrigger>
            <TabsTrigger value="identidades">Identidades</TabsTrigger>
            <TabsTrigger value="datos">Datos</TabsTrigger>
          </TabsList>
          <TabsContent value="historia">
            <Card><CardContent className="pt-6 space-y-0">
              {timeline.map((t, i) => (
                <div key={i} className="flex gap-4 py-3 border-t border-border first:border-t-0">
                  <div className="text-xs text-muted-foreground w-24 shrink-0 pt-0.5">{t.cuando}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.tipo}</span>
                      <span className="text-[0.65rem] uppercase tracking-wider text-[hsl(var(--senal))]">{t.modulo}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{t.resumen}</div>
                  </div>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>
          <TabsContent value="identidades">
            <Card><CardContent className="pt-6 space-y-0">
              {identidades.map((id, i) => (
                <div key={i} className="flex justify-between py-3 border-t border-border first:border-t-0">
                  <span className="text-xs uppercase tracking-wider text-[hsl(var(--senal))] w-24">{id.canal}</span>
                  <span className="font-mono text-sm">{id.valor}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-3">El teléfono no es la llave: cada canal es una identidad propia.</p>
            </CardContent></Card>
          </TabsContent>
          <TabsContent value="datos">
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">Sin campos personalizados definidos para este cliente.</CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
