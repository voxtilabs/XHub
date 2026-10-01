"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useYo } from "@/lib/permisos";
import { apiDocsUrl } from "@/lib/api";
import { Icon } from "@/components/icon";
import { Brand } from "@/components/brand";

/** Shared navigation and role guards for the XHub workspace. */
type Ruta = { href: string; label: string; soloPlataforma?: boolean; soloAdminCliente?: boolean; permiso?: string; modulo?: string };
const RUTAS: Ruta[] = [
  { href: "/superadmin", label: "Clientes", soloPlataforma: true },
  { href: "/superadmin/salud-xcontact", label: "Salud XContact", soloPlataforma: true },
  { href: "/superadmin/muertos", label: "Cola de muertos", soloPlataforma: true },
  { href: "/ia", label: "IA", soloPlataforma: true },
  { href: "/superadmin/auditoria", label: "Auditoría", soloPlataforma: true },
  { href: "/equipo", label: "Mi equipo", soloAdminCliente: true },
  { href: "/ajustes/webhooks", label: "Webhooks", soloAdminCliente: true },
  { href: "/automatizaciones", label: "Automatizaciones", soloAdminCliente: true },
  { href: "/ajustes/ia", label: "Inteligencia artificial", soloAdminCliente: true },
  { href: "/desarrollo", label: "Desarrolladores", soloAdminCliente: true },
  { href: "/tickets", label: "Bandeja", permiso: "bandeja.ver", modulo: "tickets" },
  { href: "/tickets/metricas", label: "Métricas", permiso: "bandeja.ver", modulo: "tickets" },
  { href: "/leads", label: "Leads", permiso: "crm.ver", modulo: "crm" },
  { href: "/oportunidades", label: "Oportunidades", permiso: "crm.ver", modulo: "crm" },
  { href: "/organizaciones", label: "Empresas", permiso: "crm.ver", modulo: "crm" },
  { href: "/insights", label: "Insights", permiso: "crm.ver", modulo: "crm" },
  { href: "/persona", label: "Personas", permiso: "ficha360.ver" },
  { href: "/seguridad", label: "Seguridad" },
];

export function BotonTema() {
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
    <button type="button" onClick={alternar} aria-label="Cambiar tema día / noche" title={tema === "claro" ? "Usar modo oscuro" : "Usar modo claro"} className="xhub-icon-button">
      <Icon name={tema === "claro" ? "moon" : "sun-dim"} weight="regular" />
    </button>
  );
}

export function AppShell() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => {
    if (!menuAbierto) return;
    const cerrar = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuAbierto(false); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [menuAbierto]);
  const path = usePathname();
  useEffect(() => { setMenuAbierto(false); }, [path]);
  const router = useRouter();
  const { data: sesion, isPending } = useSession();
  const { yo, puede, cargando: cargandoYo } = useYo();
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
    if (r.permiso) return !esPlataforma && puede(r.permiso) && (!r.modulo || (yo?.modulos?.includes(r.modulo) ?? false));
    return true;
  });
  const inic = (usuario?.name || usuario?.email || "X5").split(/[ @.]/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const activa = (href: string) => href === "/superadmin" ? path === href || path.startsWith("/superadmin/cliente") : path === href || path.startsWith(href + "/");

  const titulo = path.startsWith("/superadmin/auditoria") ? "Auditoría" : path.startsWith("/superadmin/cliente") ? "Cliente" : path.startsWith("/tickets/nuevo") ? "Nuevo ticket" : path.startsWith("/tickets/detalle") ? "Detalle de ticket" : path.startsWith("/ajustes") ? "Ajustes" : rutas.find((r) => activa(r.href))?.label || "Espacio de trabajo";
  const rol = esPlataforma ? "Plataforma" : esAdminCliente ? "Admin cliente" : "Agente";
  const iconos: Record<string, string> = { "/superadmin": "buildings", "/superadmin/salud-xcontact": "pulse", "/superadmin/muertos": "warning", "/ia": "waveform", "/superadmin/auditoria": "shield-check", "/equipo": "users-three", "/ajustes/webhooks": "webhooks-logo", "/tickets": "chats-circle", "/tickets/metricas": "chart-line", "/leads": "user-plus", "/oportunidades": "kanban", "/organizaciones": "building-office", "/insights": "gauge", "/persona": "identification-card", "/seguridad": "lock-key", "/ajustes/ia": "cpu", "/desarrollo": "plugs-connected", "/automatizaciones": "lightning" };

  return (
    <div className="xhub-shell">
      <a href="#xhub-content" className="xhub-skip-link">Ir al contenido</a>
      <aside id="xhub-sidebar" className={`xhub-sidebar ${menuAbierto ? "is-open" : ""}`} aria-label="Menú principal">
        <div className="xhub-sidebar-brand">
          <Link href={casa} aria-label="xHub · Inicio"><Brand /><span className="xhub-brand-caption">WORKSPACE</span></Link>
          <button type="button" className="xhub-icon-button xhub-mobile-close" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)}><Icon name="x" /></button>
        </div>
        <div className="xhub-workspace"><span className="xhub-workspace-icon"><Icon name={esPlataforma ? "buildings" : "users-three"} /></span><div><span className="xhub-eyebrow">{rol}</span><strong>{esPlataforma ? "Centro de administración" : esAdminCliente ? "Tu equipo de trabajo" : "Tu espacio de trabajo"}</strong></div></div>
        <span className="xhub-nav-caption">ESPACIO DE TRABAJO</span>
        <nav aria-label="Navegación principal" className="xhub-nav">
          {rutas.map((r) => (
            <Link key={r.href + r.label} href={r.href} aria-current={activa(r.href) ? "page" : undefined} className={`xhub-nav-link ${activa(r.href) ? "is-active" : ""}`} onClick={() => setMenuAbierto(false)}>
              <Icon name={iconos[r.href]} weight="regular" /><span>{r.label}</span>{activa(r.href) && <Icon name="caret-right" className="xhub-nav-chevron" />}
            </Link>
          ))}
        </nav>
        <div className="xhub-sidebar-footer"><span>UNA SOLUCIÓN DE</span><div className="xhub-partners"><span className="xhub-partner-x5"><img src="/voxia/x5-official.png" alt="" width="27" height="34" /><span>X5 Soluciones</span></span><span className="xhub-partner-divider" aria-hidden="true" /><img className="xhub-partner-xcontact" src="/voxia/xcontact-official.svg" alt="XContact" width="94" height="23" /></div></div>
      </aside>
      {menuAbierto && <button className="xhub-menu-backdrop" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} />}
      <header className="xhub-topbar">
        <div className="xhub-topbar-start">
          <button type="button" className="xhub-icon-button xhub-menu-toggle" aria-label="Abrir menú" aria-controls="xhub-sidebar" aria-expanded={menuAbierto} onClick={() => setMenuAbierto(!menuAbierto)}><Icon name="list" /></button>
          <div className="xhub-breadcrumb"><span>{rol}</span><span aria-hidden="true">/</span><strong>{titulo}</strong></div>
        </div>
        <div className="xhub-user-actions">
          {esPlataforma && <a href={apiDocsUrl()} target="_blank" rel="noreferrer" className="xhub-api-link">API <Icon name="arrow-up-right" /></a>}
          <span className="xhub-role"><Icon name={esPlataforma ? "planet" : "users-three"} />{rol}</span>
          <BotonTema />
          {usuario && <details className="xhub-session-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary aria-label="Menú de usuario">
              <span className="xhub-avatar" aria-hidden="true">{inic}</span>
              <div className="xhub-user-label"><span>{usuario.name || usuario.email}</span><small>{usuario.email}</small></div>
              <Icon name="caret-down" weight="regular" />
            </summary>
            <div className="xhub-session-popover"><span>{usuario.name || usuario.email}</span><small>{rol} · {usuario.email}</small><button type="button" onClick={() => signOut()} className="xhub-session-signout"><Icon name="sign-out" weight="regular" /> Cerrar sesión</button></div>
          </details>}
        </div>
      </header>
      <span id="xhub-content" tabIndex={-1} className="xhub-content-anchor" />
    </div>
  );
}
