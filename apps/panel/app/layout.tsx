import "./globals.css";
import type { Metadata } from "next";
import { TemaToggle } from "@/components/tema-toggle";
export const metadata: Metadata = { title: "xHub · Panel", description: "Panel de control central de X5 Soluciones" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;900&display=swap" rel="stylesheet" />
        {/* Aplica el tema guardado ANTES de pintar (sin parpadeo). */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('xhub_tema');if(t)document.documentElement.setAttribute('data-tema',t)}catch(e){}" }} />
      </head>
      <body>
        {children}
        <TemaToggle />
      </body>
    </html>
  );
}
