"use client";
import { createAuthClient } from "better-auth/react";

// baseURL del API en tiempo de EJECUCIÓN (no horneado): del origen del panel derivamos
// el del API (stagexhub → api-stagexhub, xhub → api-xhub). En dev cae a :3001.
function baseApi(): string {
  if (typeof window === "undefined") return "";
  const o = window.location.origin;
  if (o.includes("://stagexhub")) return o.replace("://stagexhub", "://api-stagexhub");
  if (o.includes("://xhub")) return o.replace("://xhub", "://api-xhub");
  return o.replace(/:\d+$/, ":3001"); // desarrollo local
}

export const authClient = createAuthClient({ baseURL: baseApi() });
export const { signIn, signOut, useSession } = authClient;
