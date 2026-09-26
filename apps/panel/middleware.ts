import { NextResponse, type NextRequest } from "next/server";

/**
 * Guarda de sesión: sin cookie de sesión (Better Auth), toda ruta redirige a /login.
 * Es una guarda BLANDA (solo presencia) — la validación real la hace get-session en el
 * cliente/servidor. Suficiente para que el panel deje de estar público.
 */
export function middleware(req: NextRequest) {
  const tieneSesion = req.cookies.getAll().some((c) => c.name.includes("session_token"));
  const enLogin = req.nextUrl.pathname === "/login";
  if (!tieneSesion && !enLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (tieneSesion && enLogin) return NextResponse.redirect(new URL("/superadmin", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|api|admin|cliente|v1).*)"] };
