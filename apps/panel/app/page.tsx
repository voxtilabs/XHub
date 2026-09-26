import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function Login() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "radial-gradient(1200px 600px at 80% -10%, hsl(var(--senal)/0.10), transparent 60%), hsl(var(--background))" }}>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
            <CardTitle className="text-xl">xHub</CardTitle>
          </div>
          <p className="text-xs font-black tracking-[0.14em] uppercase text-[hsl(var(--senal))]">Panel de control · X5 Soluciones</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-widest uppercase text-[hsl(var(--senal))]">Correo</label>
            <Input type="email" placeholder="tu@empresa.cl" autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black tracking-widest uppercase text-[hsl(var(--senal))]">Contraseña</label>
            <Input type="password" placeholder="••••••••" autoComplete="current-password" />
          </div>
          <Button className="w-full">Ingresar</Button>
        </CardContent>
      </Card>
    </main>
  );
}
