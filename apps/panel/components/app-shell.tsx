"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useYo } from "@/lib/permisos";
import { useMarca } from "@/lib/marca";
import { apiDocsUrl, apiFetch } from "@/lib/api";

/**
 * AppShell — la barra superior ÚNICA de xHub. Antes cada página dibujaba su propio
 * header (un punto + "xHub"), lo que se veía inconsistente y "de demo". Este shell da
 * una identidad real (marca X5, navegación por rol, tema día/noche en su sitio) y
 * usa <Link> para navegar sin recargar la página (sin el flash blanco de antes).
 */

type Ruta = { href: string; label: string; soloPlataforma?: boolean; soloAdminCliente?: boolean; permiso?: string };
const RUTAS: Ruta[] = [
  { href: "/superadmin", label: "Clientes", soloPlataforma: true },
  { href: "/ia", label: "IA", soloPlataforma: true },
  { href: "/equipo", label: "Mi equipo", soloAdminCliente: true },
  { href: "/tickets", label: "Bandeja", permiso: "bandeja.ver" },
  { href: "/tickets/metricas", label: "Métricas", permiso: "bandeja.ver" },
  { href: "/persona", label: "Personas", permiso: "ficha360.ver" },
];

function BotonTema() {
  const [tema, setTema] = useState<"oscuro" | "claro">("oscuro");
  useEffect(() => {
    setTema(document.documentElement.getAttribute("data-tema") === "claro" ? "claro" : "oscuro");
  }, []);
  function alternar() {
    const nuevo = tema === "claro" ? "oscuro" : "claro";
    setTema(nuevo);
    const raiz = document.documentElement;
    raiz.setAttribute("data-tema", nuevo);
    raiz.style.colorScheme = nuevo === "claro" ? "light" : "dark";
    try { localStorage.setItem("xhub_tema", nuevo); } catch { /* privado */ }
  }
  return (
    <button onClick={alternar} aria-label="Cambiar tema día / noche" title="Día / Noche"
      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition">
      {tema === "claro" ? (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
      ) : (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      )}
    </button>
  );
}

export function AppShell() {
  const path = usePathname();
  const router = useRouter();
  const { data: sesion, isPending } = useSession();
  const { yo, puede, cargando: cargandoYo } = useYo();
  async function salirSoporte() { try { await apiFetch("/admin/soporte", { method: "DELETE" }); } catch { /* igual salimos */ } window.location.href = "/superadmin"; }
  const marca = useMarca();
  const usuario = sesion?.user as { email?: string; name?: string; rol?: string } | undefined;
  const esPlataforma = !usuario || usuario.rol === "plataforma";
  const esAdminCliente = usuario?.rol === "admin_cliente";
  // Tres poblaciones, cada una a su casa: plataforma → /superadmin, admin de cliente →
  // /equipo, agente (usuario) → /tickets. El middleware solo ve que EXISTA la cookie;
  // aquí, ya validada contra el backend, echamos a /login si es inválida, y sacamos a
  // cada rol de las zonas que no le tocan (le darían 403).
  const casaAgente = puede("bandeja.ver") ? "/tickets" : (puede("ficha360.ver") || puede("personas.buscar")) ? "/persona" : "/tickets";
  const casa = esPlataforma ? "/superadmin" : esAdminCliente ? "/equipo" : casaAgente;
  useEffect(() => {
    if (isPending) return;
    if (!sesion?.user) { router.replace("/login"); return; }
    if (!esPlataforma && !esAdminCliente && cargandoYo) return; // esperar permisos del agente
    if (!esPlataforma && (path.startsWith("/superadmin") || path.startsWith("/ia"))) router.replace(casa);
    if (!esAdminCliente && path.startsWith("/equipo")) router.replace(casa);
  }, [isPending, sesion, esPlataforma, esAdminCliente, casa, cargandoYo, path, router]);
  const rutas = RUTAS.filter((r) => {
    if (r.soloPlataforma) return esPlataforma;
    if (r.soloAdminCliente) return esAdminCliente;
    if (r.permiso) return !esPlataforma && puede(r.permiso);
    return true;
  });
  const inic = (usuario?.name || usuario?.email || "X5").split(/[ @.]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const activa = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[hsl(var(--background)/0.72)] backdrop-blur-xl">
      {yo?.esSoporte && (
        <div className="flex items-center gap-2 px-4 sm:px-6 py-1.5 text-[12.5px] font-medium" style={{ background: "hsl(var(--critico))", color: "white" }}>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          <span>Modo soporte — estás actuando dentro de un cliente{yo.motivoSoporte ? ` · ${yo.motivoSoporte}` : ""}</span>
          <button onClick={salirSoporte} className="ml-auto rounded-pill bg-white/20 hover:bg-white/30 px-3 py-0.5 font-semibold transition">Salir de soporte</button>
        </div>
      )}
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {/* Marca: cuadro con degradé señal→acción (identidad X5) + wordmark */}
        <Link href={esPlataforma ? "/superadmin" : "/tickets"} className="flex items-center gap-2.5 shrink-0 group">
          {marca?.logo_url ? (
            <img src={marca.logo_url} alt={marca.nombre_marca || "logo"} className="h-8 w-auto max-w-[130px] object-contain" />
          ) : (
            <span className="relative h-8 w-8 rounded-[9px] grid place-items-center text-[13px] font-black text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, hsl(var(--senal)), hsl(var(--primary)))" }}>
              {marca?.nombre_marca ? marca.nombre_marca.slice(0, 2).toUpperCase() : "x5"}
              <span className="absolute inset-0 rounded-[9px] ring-1 ring-white/15" />
            </span>
          )}
          <span className="leading-none">
            <span className="block font-semibold tracking-tight text-[15px]">{marca?.nombre_marca || "xHub"}</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{marca?.nombre_marca ? "xHub" : "X5 Soluciones"}</span>
          </span>
        </Link>

        {/* Navegación por rol */}
        <nav className="hidden md:flex items-center gap-1 ml-2">
          {rutas.map((r) => (
            <Link key={r.href + r.label} href={r.href}
              className={`px-3 h-8 grid place-items-center rounded-md text-sm transition ${
                activa(r.href) ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}>
              {r.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Cluster derecho: API + tema + usuario */}
        {esPlataforma && (
          <a href={apiDocsUrl()} target="_blank" rel="noreferrer"
            className="hidden sm:grid h-8 px-3 place-items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition">
            API&nbsp;↗
          </a>
        )}
        <BotonTema />
        {usuario && (
          <div className="flex items-center gap-2 pl-2 sm:pl-3 sm:ml-1 sm:border-l border-border">
            <span className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold bg-secondary text-foreground shrink-0">{inic}</span>
            <div className="hidden sm:block leading-tight min-w-0">
              <div className="text-[13px] font-medium truncate max-w-[160px]">{usuario.email}</div>
              <div className="text-[11px] text-muted-foreground">{esPlataforma ? "Plataforma" : "Admin cliente"}</div>
            </div>
            <button onClick={() => signOut()} title="Cerrar sesión" aria-label="Cerrar sesión"
              className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-critico hover:bg-secondary transition">
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Nav móvil */}
      <nav className="md:hidden flex items-center gap-1 px-3 pb-2 -mt-1 overflow-x-auto">
        {rutas.map((r) => (
          <Link key={r.href + r.label} href={r.href}
            className={`px-3 h-8 grid place-items-center rounded-md text-sm whitespace-nowrap transition ${
              activa(r.href) ? "bg-secondary text-foreground font-medium" : "text-muted-foreground"}`}>
            {r.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
