"use client";
import { createAuthClient } from "better-auth/react";

// Mismo origen que el panel: el proxy (next.config rewrites) reenvía /api/auth al API.
// Así la cookie de sesión es de PRIMERA parte y no la bloquea el navegador.
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});
export const { signIn, signOut, useSession } = authClient;
