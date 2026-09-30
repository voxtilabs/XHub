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
      </head>
      <body>{children}</body>
    </html>
  );
}
