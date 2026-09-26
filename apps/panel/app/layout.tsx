import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "xHub · Panel", description: "Panel de control central de X5 Soluciones" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;900&display=swap" rel="stylesheet" />
        {/* Fija el tema ANTES de pintar y marca el color-scheme para que el navegador
            no muestre un flash blanco al navegar (el bug del "flashback"). */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('xhub_tema')||'oscuro';document.documentElement.setAttribute('data-tema',t);document.documentElement.style.colorScheme=(t==='claro'?'light':'dark')}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
