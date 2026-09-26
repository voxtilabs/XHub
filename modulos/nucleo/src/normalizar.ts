import { ErrorApi } from "@xhub/core";

export type Canal = "telefono" | "email" | "rut" | "xcontact" | "webchat" | "instagram" | "messenger";

/** Teléfono chileno a E.164 (+56 9 XXXXXXXX). Acepta variantes comunes. */
export function normalizarTelefono(v: string): string {
  const d = v.replace(/[^\d]/g, "");
  // casos: 56912345678 | 912345678 | 12345678 (sin el 9) | +56...
  let n = d;
  if (n.startsWith("56")) n = n.slice(2);
  if (n.length === 8) n = "9" + n;          // faltaba el 9 de celular
  if (n.length !== 9 || !n.startsWith("9"))
    throw new ErrorApi("VALIDACION", `Teléfono chileno inválido: ${v}`);
  return "+56" + n;
}

/** RUT a forma canónica "cuerpo-DV" con DV validado (módulo 11). */
export function normalizarRut(v: string): string {
  const limpio = v.replace(/[.\s]/g, "").toUpperCase();
  const m = limpio.match(/^(\d+)-?([\dK])$/);
  if (!m) throw new ErrorApi("VALIDACION", `RUT inválido: ${v}`);
  const cuerpo = String(parseInt(m[1], 10));   // quita ceros a la izquierda
  const dv = m[2];
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  const dvOk = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  if (dvOk !== dv) throw new ErrorApi("VALIDACION", `Dígito verificador inválido en RUT: ${v}`);
  return `${cuerpo}-${dv}`;
}

/** Email normalizado: minúsculas, trim, exige dominio con punto. */
export function normalizarEmail(v: string): string {
  const e = v.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    throw new ErrorApi("VALIDACION", `Email inválido: ${v}`);
  return e;
}

/** Normaliza según el canal. Los canales opacos (xcontact, redes) se dejan tal cual. */
export function normalizarIdentidad(canal: Canal, valor: string): string {
  switch (canal) {
    case "telefono": return normalizarTelefono(valor);
    case "email": return normalizarEmail(valor);
    case "rut": return normalizarRut(valor);
    default: {
      const v = valor.trim();
      if (!v) throw new ErrorApi("VALIDACION", `Identificador vacío para canal ${canal}`);
      return v;
    }
  }
}
