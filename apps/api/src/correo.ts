import nodemailer, { type Transporter } from "nodemailer";

/**
 * Correo saliente por UN ÚNICO SMTP de plataforma (secretos por env, nunca en la base).
 * Dos modos:
 *  - OAuth2 Microsoft 365 (XHUB_SMTP_OAUTH=microsoft): token client-credentials → XOAUTH2.
 *    M365 solo permite enviar COMO el buzón autorizado (XHUB_SMTP_FROM/USER); la identidad
 *    del cliente va en el nombre visible + Reply-To. La app necesita permiso SMTP.SendAsApp.
 *  - Basic auth (XHUB_SMTP_USER/PASS): SMTP clásico.
 * La identidad "From" (nombre de marca + correo de soporte) es por cliente. Si no está
 * configurado, degrada con motivo (no rompe el flujo del ticket). Nunca dentro de una tx.
 */
const esOAuth = () => process.env.XHUB_SMTP_OAUTH === "microsoft";

let cacheToken: { token: string; exp: number } | null = null;
async function tokenM365(): Promise<string> {
  const now = Date.now();
  if (cacheToken && cacheToken.exp > now + 60_000) return cacheToken.token;
  const tenant = process.env.XHUB_SMTP_TENANT, id = process.env.XHUB_SMTP_CLIENTID, secret = process.env.XHUB_SMTP_CLIENTSECRET;
  if (!tenant || !id || !secret) throw new Error("Faltan XHUB_SMTP_TENANT/CLIENTID/CLIENTSECRET");
  const body = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials", scope: "https://outlook.office365.com/.default" });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!j.access_token) throw new Error("Token M365: " + (j.error_description || "sin access_token"));
  cacheToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

let transporteBasic: Transporter | null | undefined;
function basico(): Transporter | null {
  if (transporteBasic !== undefined) return transporteBasic;
  const host = process.env.XHUB_SMTP_HOST;
  if (!host) { transporteBasic = null; return null; }
  transporteBasic = nodemailer.createTransport({
    host, port: Number(process.env.XHUB_SMTP_PORT || 587), secure: process.env.XHUB_SMTP_SECURE === "true",
    auth: process.env.XHUB_SMTP_USER ? { user: process.env.XHUB_SMTP_USER, pass: process.env.XHUB_SMTP_PASS || "" } : undefined,
  });
  return transporteBasic;
}

export async function enviarCorreo(a: { to: string; fromName: string; fromEmail: string; subject: string; text: string; replyTo?: string }): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    if (esOAuth()) {
      const user = process.env.XHUB_SMTP_USER;
      if (!user) return { enviado: false, motivo: "OAuth M365: falta XHUB_SMTP_USER (buzón)" };
      const accessToken = await tokenM365();
      const remitente = process.env.XHUB_SMTP_FROM || user;
      const t = nodemailer.createTransport({
        host: process.env.XHUB_SMTP_HOST || "smtp.office365.com",
        port: Number(process.env.XHUB_SMTP_PORT || 587), secure: false,
        auth: { type: "OAuth2", user, accessToken },
      });
      await t.sendMail({ from: `"${a.fromName}" <${remitente}>`, sender: remitente, to: a.to, subject: a.subject, text: a.text, replyTo: a.replyTo || a.fromEmail });
      return { enviado: true };
    }
    const t = basico();
    if (!t) return { enviado: false, motivo: "SMTP no configurado (falta XHUB_SMTP_HOST)" };
    await t.sendMail({ from: `"${a.fromName}" <${a.fromEmail}>`, to: a.to, subject: a.subject, text: a.text, replyTo: a.replyTo });
    return { enviado: true };
  } catch (e) { return { enviado: false, motivo: (e as Error).message }; }
}
