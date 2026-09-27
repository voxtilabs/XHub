import { NextResponse, type NextRequest } from "next/server";

/**
 * Guarda de sesión + aterrizaje por SUBDOMINIO. Sin cookie de sesión (Better Auth),
 * toda ruta redirige a /login (guarda blanda; la validación real la hace get-session).
 *
 * Además: el subdominio de tickets (tickets-…) ES la app de xTickets. Entrar a su raíz
 * te deja en la bandeja, no en el hub. El dominio principal aterriza en /superadmin y el
 * AppShell corrige a la casa de cada rol.
 */
function inicioDe(host: string): string {
  return host.startsWith("tickets-") || host.startsWith("tickets.") ? "/tickets" : "/superadmin";
}
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const inicio = inicioDe(host);
  const tieneSesion = req.cookies.getAll().some((c) => c.name.includes("session_token"));
  const path = req.nextUrl.pathname;
  const enLogin = path === "/login";
  if (!tieneSesion && !enLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (tieneSesion && (enLogin || path === "/")) return NextResponse.redirect(new URL(inicio, req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|api|admin|cliente|v1).*)"] };
