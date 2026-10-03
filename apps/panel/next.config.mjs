/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Conserva las rutas compiladas al alternar entre módulos en desarrollo.
  onDemandEntries: {
    maxInactiveAge: 10 * 60 * 1000,
    pagesBufferLength: 32,
  },
  // Sin config de ESLint en el repo; el type-check de TS sí corre en el build.
  eslint: { ignoreDuringBuilds: true },
  // El panel proxea el API por SU MISMO origen (same-origin) → la cookie de sesión es
  // de primera parte y no la bloquea la protección anti-terceros del navegador. El
  // navegador solo habla con el panel; el proxy va al API por la red interna del compose.
  async rewrites() {
    const api = process.env.XHUB_API_INTERNO || "http://localhost:3001";
    return [
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
      { source: "/admin/:path*", destination: `${api}/admin/:path*` },
      { source: "/cliente/:path*", destination: `${api}/cliente/:path*` },
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
    ];
  },
};
