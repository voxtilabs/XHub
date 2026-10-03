"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn, twoFactor } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";

function MarcasOficiales() {
  return <div className="xhub-login-partners">
    <span className="xhub-login-partner-x5"><img src="/voxia/x5-official.png" width="51" height="64" alt="" /><span>X5 Soluciones</span></span>
    <span className="xhub-login-partner-divider" aria-hidden="true" />
    <img className="xhub-login-partner-xcontact" src="/voxia/xcontact-official.svg" width="213" height="47" alt="XContact" />
  </div>;
}

function IlustracionConexiones() {
  return <div className="xhub-login-art" aria-hidden="true">
    <img className="xhub-login-art-image" src="/voxia/xhub-login-champagne-v2.webp" width="1774" height="887" alt="" loading="lazy" decoding="async" />
  </div>;
}

export default function Login() {
  const [mostrarClave, setMostrarClave] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [temaAcceso, setTemaAcceso] = useState<"claro" | "oscuro">("claro");
  // 2FA: si el usuario lo tiene activo, tras la contraseña se pide el código.
  const [paso2fa, setPaso2fa] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [usarRespaldo, setUsarRespaldo] = useState(false);

  useEffect(() => {
    // The chosen login defaults to a light form, independently of the workspace.
    setTemaAcceso(document.documentElement.getAttribute("data-login-tema") === "oscuro" ? "oscuro" : "claro");
  }, []);

  function alternarTemaAcceso() {
    const nuevo = temaAcceso === "claro" ? "oscuro" : "claro";
    setTemaAcceso(nuevo);
    document.documentElement.setAttribute("data-login-tema", nuevo);
    try { localStorage.setItem("xhub_login_tema", nuevo); } catch { /* almacenamiento privado */ }
  }

  const irADestino = () => { location.href = window.location.host.startsWith("tickets-") ? "/tickets" : "/superadmin"; };

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setCargando(true); setError(null);
    const r = await signIn.email({ email, password: clave });
    if (r.error) { setError(r.error.message || "No pudimos iniciar sesión"); setCargando(false); return; }
    // Si el usuario tiene 2FA activo, Better Auth NO abre sesión aún: pide el segundo factor.
    if ((r.data as { twoFactorRedirect?: boolean } | undefined)?.twoFactorRedirect) {
      setPaso2fa(true); setCargando(false); return;
    }
    irADestino();
  }

  async function verificar2fa(e: FormEvent) {
    e.preventDefault();
    setCargando(true); setError(null);
    const code = codigo.replace(/\s/g, "");
    const r = usarRespaldo
      ? await twoFactor.verifyBackupCode({ code })
      : await twoFactor.verifyTotp({ code });
    if (r.error) { setError(r.error.message || "Código inválido"); setCargando(false); return; }
    irADestino();
  }

  return (
    <main className="xhub-login-screen" data-step={paso2fa ? "verification" : "password"}>
      <a className="xhub-skip-link" href={paso2fa ? "#codigo" : "#email"}>Ir al inicio de sesión</a>
      <section className="xhub-login-hero" aria-labelledby="access-title">
        <header className="xhub-login-header"><Brand /><span className="xhub-login-edition">WORKSPACE</span></header>
        <div className="xhub-login-intro">
          <h1 id="access-title">Todo tu equipo.<br /><span>En un mismo lugar.</span></h1>
          <p>Personas, conversaciones y equipos.<br />Todo en un solo lugar.</p>
        </div>
        <IlustracionConexiones />
        <footer className="xhub-login-brand-footer"><span className="xhub-login-brand-caption">Una solución de</span><MarcasOficiales /></footer>
      </section>

      <section className="xhub-login-auth" aria-labelledby="login-title">
        <div className="xhub-login-mobile-brand"><Brand /></div>
        <div className="xhub-login-controls">
          <button type="button" className="xhub-login-theme" onClick={alternarTemaAcceso} aria-label="Cambiar tema día / noche" aria-pressed={temaAcceso === "oscuro"} title={temaAcceso === "claro" ? "Usar modo oscuro" : "Usar modo claro"}><Icon name={temaAcceso === "claro" ? "sun-dim" : "moon"} weight="regular" /></button>
        </div>
        <div className="xhub-login-auth-content">
          <div className="xhub-login-eyebrow"><Icon name="shield-check" weight="duotone" /><span>Acceso a <strong>xHub</strong></span></div>
          <h2 id="login-title">{paso2fa ? "Verificación en dos pasos" : "Hola de nuevo."}</h2>
          <p className="xhub-login-welcome">{paso2fa ? "Ingresa el código de tu app de autenticación." : "Entra a tu espacio de trabajo."}</p>

          {paso2fa ? (
            <form onSubmit={verificar2fa} className="xhub-login-form">
              <div className="xhub-login-field">
                <label htmlFor="codigo">{usarRespaldo ? "Código de respaldo" : "Código de 6 dígitos"}</label>
                <div className="xhub-login-input"><Icon name="shield-check" weight="regular" />
                  <Input id="codigo" inputMode={usarRespaldo ? "text" : "numeric"} autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder={usarRespaldo ? "xxxx-xxxx" : "123456"} autoFocus required /></div>
              </div>
              {error && <div role="alert" className="xhub-login-error"><Icon name="warning-circle" /><span>{error}</span></div>}
              <Button type="submit" disabled={cargando} className="xhub-login-submit"><span>{cargando ? "Verificando…" : "Verificar"}</span><Icon name={cargando ? "circle-notch" : "arrow-right"} weight="regular" className={cargando ? "xhub-loading-icon" : ""} /></Button>
              <div className="xhub-login-help"><Icon name="info" weight="regular" /><p><button type="button" style={{ textDecoration: "underline", cursor: "pointer", background: "none", border: 0, color: "inherit", font: "inherit", padding: 0 }} onClick={() => { setUsarRespaldo(!usarRespaldo); setCodigo(""); setError(null); }}>{usarRespaldo ? "Usar el código de la app" : "¿Perdiste tu teléfono? Usa un código de respaldo"}</button></p></div>
            </form>
          ) : (
          <form onSubmit={entrar} className="xhub-login-form">
            <div className="xhub-login-field">
              <label htmlFor="email">Correo electrónico</label>
              <div className="xhub-login-input"><Icon name="envelope-simple" weight="regular" /><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" autoComplete="username" required /></div>
            </div>
            <div className="xhub-login-field">
              <label htmlFor="clave">Contraseña</label>
              <div className="xhub-login-input"><Icon name="lock-key" weight="regular" /><Input id="clave" type={mostrarClave ? "text" : "password"} value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu contraseña" autoComplete="current-password" required onKeyUp={(e) => setMayusculas(e.getModifierState("CapsLock"))} onBlur={() => setMayusculas(false)} /><button className="xhub-login-password-toggle" type="button" aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={mostrarClave} onClick={() => setMostrarClave(!mostrarClave)}><Icon name={mostrarClave ? "eye-slash" : "eye"} weight="regular" /></button></div>
              {mayusculas && <p className="xhub-login-caps" role="status"><Icon name="warning-circle" />Bloq Mayús está activado.</p>}
            </div>
            {error && <div role="alert" className="xhub-login-error"><Icon name="warning-circle" /><span>{error}</span></div>}
            <Button type="submit" disabled={cargando} className="xhub-login-submit"><span>{cargando ? "Ingresando…" : "Ingresar a xHub"}</span><Icon name={cargando ? "circle-notch" : "arrow-right"} weight="regular" className={cargando ? "xhub-loading-icon" : ""} /></Button>
          </form>
          )}
          {!paso2fa && <div className="xhub-login-help"><Icon name="info" weight="regular" /><p>¿Necesitas una cuenta?<br /><span>Solicítala al administrador.</span></p></div>}
          <p className="xhub-login-privacy"><Link href="/privacidad">Política de privacidad</Link></p>
        </div>
      </section>
    </main>
  );
}
