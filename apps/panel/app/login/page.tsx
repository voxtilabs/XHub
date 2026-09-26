"use client";
import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function Login() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setCargando(true); setError(null);
    const r = await signIn.email({ email, password: clave });
    if (r.error) { setError(r.error.message || "No pudimos iniciar sesión"); setCargando(false); }
    else location.href = "/tickets";
  }

  return (
    <main className="min-h-screen grid place-items-center p-4"
      style={{ background: "radial-gradient(1000px 500px at 80% -10%, hsl(var(--senal)/0.10), transparent 60%), hsl(var(--background))" }}>
      <Card className="w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" style={{ boxShadow: "0 0 12px hsl(var(--primary))" }} />
          <span className="text-xl font-semibold tracking-tight">xHub</span>
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[hsl(var(--senal))] mb-6">Consola X5 · Panel de control</div>
        <form onSubmit={entrar} className="flex flex-col gap-4">
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Correo</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@x5.cl" className="mt-1.5" autoComplete="username" required />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Contraseña</label>
            <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="••••••••" className="mt-1.5" autoComplete="current-password" required />
          </div>
          {error && <div className="text-[13px] text-[hsl(var(--critico))]">{error}</div>}
          <Button type="submit" disabled={cargando} className="w-full justify-center mt-1">{cargando ? "Ingresando…" : "Ingresar"}</Button>
        </form>
      </Card>
    </main>
  );
}
