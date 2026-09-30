"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Mismo origen que el panel: el proxy (next.config rewrites) reenvía /api/auth al API.
// Así la cookie de sesión es de PRIMERA parte y no la bloquea el navegador.
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [twoFactorClient()],
});
export const { signIn, signOut, useSession, twoFactor } = authClient;
