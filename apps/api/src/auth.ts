import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

/**
 * Better Auth — el login de xHub. NO reinventamos la rueda: sesiones, hash de
 * contraseñas, cookies seguras y CSRF los resuelve la librería. Vive en el API
 * (la base es un asunto del backend); el panel apunta acá por subdominio.
 *
 * Cookie cross-subdominio: el panel (stagexhub) y el API (api-stagexhub) comparten
 * la cookie por el dominio raíz (.voxtilabs.cl), con SameSite=None + Secure.
 */
const dominioCookie = process.env.XHUB_COOKIE_DOMINIO || undefined;
const orígenes = (process.env.XHUB_CORS_ORIGENES || "http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  user: {
    additionalFields: {
      rol: { type: "string", required: false, defaultValue: "plataforma", input: false },
      clienteId: { type: "string", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // El panel NO es de registro abierto: las cuentas las crea un admin (seed/alta),
    // no cualquiera que llegue al endpoint. El login sí es público.
    disableSignUp: true,
  },
  // 2FA OPCIONAL: el usuario lo activa desde su configuración; el login exige el
  // segundo factor (TOTP + códigos de respaldo) SOLO si el usuario lo tiene activo.
  plugins: [twoFactor({ issuer: "xHub" })],
  trustedOrigins: orígenes,
  advanced: {
    crossSubDomainCookies: dominioCookie ? { enabled: true, domain: dominioCookie } : { enabled: false },
    defaultCookieAttributes: dominioCookie
      ? { sameSite: "none", secure: true, httpOnly: true }
      : { httpOnly: true },
  },
});
