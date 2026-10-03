"use client";
import { Icon } from "@/components/icon";
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { twoFactor, useSession } from "@/lib/auth-client";
import { HeroFeatures } from "@/components/hero-features";

type Fase = "estado" | "activando" | "confirmando";

export default function Seguridad() {
  const { data: sesion, isPending, refetch } = useSession();
  const activo = !!(sesion?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;

  const [fase, setFase] = useState<Fase>("estado");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [respaldo, setRespaldo] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };
  const secretoDe = (u: string) => { try { return new URL(u).searchParams.get("secret"); } catch { return null; } };

  async function activar() {
    setError(null); setCargando(true);
    try {
      const r = await twoFactor.enable({ password: clave });
      if (r.error) { setError(r.error.message || "No se pudo iniciar la activación"); return; }
      const d = r.data as { totpURI: string; backupCodes: string[] };
      setUri(d.totpURI); setRespaldo(d.backupCodes ?? []);
      const QR = (await import("qrcode")).default;
      setQr(await QR.toDataURL(d.totpURI, { margin: 1, width: 200 }));
      setFase("confirmando"); setClave("");
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }

  async function confirmar() {
    setError(null); setCargando(true);
    try {
      const r = await twoFactor.verifyTotp({ code: codigo.replace(/\s/g, "") });
      if (r.error) { setError(r.error.message || "Código incorrecto"); return; }
      setFase("estado"); setCodigo(""); setQr(null); setUri(null);
      await refetch?.(); flash("Verificación en dos pasos activada");
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }

  async function desactivar() {
    setError(null); setCargando(true);
    try {
      const r = await twoFactor.disable({ password: clave });
      if (r.error) { setError(r.error.message || "No se pudo desactivar"); return; }
      setClave(""); setFase("estado"); await refetch?.(); flash("Verificación en dos pasos desactivada");
    } catch (e) { setError((e as Error).message); } finally { setCargando(false); }
  }

  return (
    <main className="min-h-screen">
      <AppShell />
      <div className="xhub-page xhub-platform-page xhub-security-page">
        <div className="xhub-page-heading" data-hero="security">
          <div>
            <div className="xhub-eyebrow">TU CUENTA</div>
            <h1>Seguridad</h1>
            <p>Añade una segunda capa a tu inicio de sesión. Opcional, pero muy recomendada.</p>
          <HeroFeatures variant="seguridad" />
          </div>
        </div>

        {error && <div className="p-3 rounded-md text-[13px]" style={{ background: "hsl(var(--critico)/0.09)", border: "1px solid hsl(var(--critico)/0.35)", color: "hsl(var(--critico))" }}><Icon name="warning-circle" className="xhub-inline-icon" /> {error}</div>}
        {msg && <div className="p-2.5 rounded-md text-[13px]" style={{ background: "hsl(var(--exito)/0.1)", color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> {msg}</div>}

        <Card><CardContent className="pt-5">
          <div className="xhub-security-heading flex items-center gap-3 flex-wrap mb-3">
            <span className="xhub-platform-glyph" aria-hidden="true"><Icon name="shield-check" weight="duotone" /></span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-semibold">Verificación en dos pasos (2FA)</h2>
              <p className="text-[13px] text-muted-foreground">Un código de tu app de autenticación (Google Authenticator, 1Password, Authy…) además de tu contraseña.</p>
            </div>
            <Badge rol={activo ? "exito" : "neutro"}>{isPending ? "…" : activo ? "Activa" : "Inactiva"}</Badge>
          </div>

          {isPending ? <p className="text-[13px] text-muted-foreground">Cargando…</p> : !activo ? (
            fase !== "confirmando" ? (
              <div className="xhub-security-form flex flex-col gap-2">
                <label className="text-[13px]">Confirma tu contraseña para activar
                  <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu contraseña" autoComplete="current-password" className="mt-1" /></label>
                <div><Button size="sm" onClick={activar} disabled={cargando || clave.length < 6}>{cargando ? "…" : "Activar 2FA"}</Button></div>
              </div>
            ) : (
              <div className="xhub-security-form flex flex-col gap-3">
                <p className="text-[13px]">1) Escanea este código con tu app de autenticación:</p>
                {qr && <img src={qr} alt="Código QR para 2FA" width={200} height={200} style={{ borderRadius: 8, background: "#fff", padding: 8 }} />}
                {uri && <details className="text-[12px] text-muted-foreground"><summary className="cursor-pointer">o ingresa la clave manualmente</summary><code className="font-mono break-all block mt-1 p-2 rounded bg-secondary">{secretoDe(uri)}</code></details>}
                {respaldo.length > 0 && (
                  <div className="p-2.5 rounded-md text-[12px]" style={{ background: "hsl(var(--aviso)/0.1)" }}>
                    <b>Guarda tus códigos de respaldo</b> (te dejan entrar si pierdes el teléfono; cada uno sirve una vez):
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono mt-1">{respaldo.map((c) => <span key={c}>{c}</span>)}</div>
                  </div>
                )}
                <label className="text-[13px]">2) Ingresa el código de 6 dígitos que muestra la app:
                  <Input inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123456" autoComplete="one-time-code" className="mt-1" /></label>
                <div className="flex gap-2"><Button size="sm" onClick={confirmar} disabled={cargando || codigo.replace(/\s/g, "").length < 6}>{cargando ? "…" : "Confirmar y activar"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setFase("estado"); setQr(null); setCodigo(""); }}>Cancelar</Button></div>
              </div>
            )
          ) : (
            <div className="xhub-security-form flex flex-col gap-2">
              <p className="text-[13px]" style={{ color: "hsl(var(--exito))" }}><Icon name="check-circle" className="xhub-inline-icon" /> Tu cuenta pide un código además de la contraseña al entrar.</p>
              <label className="text-[13px]">Para desactivarla, confirma tu contraseña
                <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu contraseña" autoComplete="current-password" className="mt-1" /></label>
              <div><Button size="sm" variant="outline" onClick={desactivar} disabled={cargando || clave.length < 6}>{cargando ? "…" : "Desactivar 2FA"}</Button></div>
            </div>
          )}
        </CardContent></Card>

        <p className="text-[12px] text-muted-foreground mt-3">Consulta cómo tratamos tus datos en la <Link href="/privacidad" className="text-[hsl(var(--senal))] hover:underline">política de privacidad</Link>.</p>
      </div>
    </main>
  );
}
