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
    else location.href = "/superadmin";
  }

  return (
    <main className="relative min-h-screen grid place-items-center p-4 overflow-hidden" style={{ background: "#05070a" }}>
      {/* Rejilla tenue que se desvanece arriba y abajo (x5s.cl). */}
      <div aria-hidden className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(90deg,#ffffff08 1px,transparent 1px),linear-gradient(#ffffff08 1px,transparent 1px)",
        backgroundSize: "60px 60px",
        maskImage: "linear-gradient(transparent,#000 28% 72%,transparent)",
        WebkitMaskImage: "linear-gradient(transparent,#000 28% 72%,transparent)",
      }} />
      {/* Aurora cian→naranja que respira (footer de x5s.cl). */}
      <div aria-hidden className="aurora absolute top-1/2 left-1/2 rounded-full" style={{
        width: "min(85vw,60rem)", height: "62%",
        background: "radial-gradient(circle,#75d8ee29 0%,#ff7a1a1f 42%,transparent 70%)",
        filter: "blur(80px)", animation: "aurora-breathe 9s ease-in-out infinite alternate",
      }} />
      <Card className="relative w-full max-w-sm p-8">
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
