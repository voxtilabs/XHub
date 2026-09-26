/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Sin config de ESLint en el repo; el type-check de TS sí corre en el build (es el valor).
  eslint: { ignoreDuringBuilds: true },
};
