import "./globals.css";
import "./voxia-layout.css";
import "./workspace.css";
import "./horizon-workspace.css";
import "./horizon-complete.css";
import "./tickets-horizon.css";
import "./crm-horizon.css";
import "./platform-horizon.css";
import "./prompt-dialog.css";
import "./login-horizon.css";
import "./futurista-workspace.css";
import "./futurista-crm.css";
import "./futurista-platform.css";
import "./inbox-console.css";
import "./metrics-console.css";
import "./persona-hero.css";
import "./workspace-heroes.css";
import "./session-controls.css";
import "./scrollbars.css";
import "./motion.css";
import "./light-workspace.css";
import "./team-console.css";
import "./workspace-iconography.css";
import "./sidebar-navigation.css";
import "./light-heroes.css";
import "./webhooks-console.css";
import "./ai-settings-console.css";
import "./insights-console.css";
import "./opportunities-console.css";
import "./audit-console.css";
import "./developer-console.css";
import { WorkspaceMotionProvider } from "@/components/workspace-motion";
import type { Metadata, Viewport } from "next";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const metadata: Metadata = { title: "xHub · Panel", description: "Panel de control central de X5 Soluciones" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/voxia/fonts/inter-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/voxia/fonts/outfit-650.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/voxia/fonts/mono-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Fija el tema ANTES de pintar y marca el color-scheme para que el navegador
            no muestre un flash blanco al navegar (el bug del "flashback"). */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('xhub_tema')||'claro';document.documentElement.setAttribute('data-tema',t);document.documentElement.style.colorScheme=(t==='claro'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-tema','claro')}" }} />
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.setAttribute('data-login-tema',localStorage.getItem('xhub_login_tema')==='oscuro'?'oscuro':'claro')}catch(e){}" }} />
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.xhubSidebar=localStorage.getItem('xhub_sidebar')==='compact'?'compact':'expanded'}catch(e){document.documentElement.dataset.xhubSidebar='expanded'}" }} />
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.xhubMotion=matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced':'active'}catch(e){document.documentElement.dataset.xhubMotion='active'}" }} />
      </head>
      <body><WorkspaceMotionProvider>{children}</WorkspaceMotionProvider></body>
    </html>
  );
}
