import nodemailer, { type Transporter } from "nodemailer";

/**
 * Correo saliente por UN ÚNICO SMTP de plataforma (secretos por env, ADR: nunca en la
 * base). La identidad "From" es por cliente (nombre de marca + correo de soporte); el
 * transporte es uno solo. Si el SMTP no está configurado, degrada: no envía y lo dice
 * (no rompe el flujo del ticket). Nunca se llama dentro de una transacción (regla nº7).
 */
let transporte: Transporter | null | undefined;
function obtener(): Transporter | null {
  if (transporte !== undefined) return transporte;
  const host = process.env.XHUB_SMTP_HOST;
  if (!host) { transporte = null; return null; }
  transporte = nodemailer.createTransport({
    host,
    port: Number(process.env.XHUB_SMTP_PORT || 587),
    secure: process.env.XHUB_SMTP_SECURE === "true",
    auth: process.env.XHUB_SMTP_USER ? { user: process.env.XHUB_SMTP_USER, pass: process.env.XHUB_SMTP_PASS || "" } : undefined,
  });
  return transporte;
}

export async function enviarCorreo(a: { to: string; fromName: string; fromEmail: string; subject: string; text: string; replyTo?: string }): Promise<{ enviado: boolean; motivo?: string }> {
  const t = obtener();
  if (!t) return { enviado: false, motivo: "SMTP no configurado (falta XHUB_SMTP_HOST)" };
  try {
    await t.sendMail({ from: `"${a.fromName}" <${a.fromEmail}>`, to: a.to, subject: a.subject, text: a.text, replyTo: a.replyTo });
    return { enviado: true };
  } catch (e) { return { enviado: false, motivo: (e as Error).message }; }
}
