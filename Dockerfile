# syntax=docker/dockerfile:1
# Imagen única de xHub con varios puntos de entrada (migrate, api, workers, panel).
# El proceso se elige por XHUB_PROCESO (ADR 0002). El api corre TypeScript directo con
# tsx (sin build); el panel es Next y sí se compila aquí (turbo build). Máxima
# portabilidad: una imagen, un `docker compose up`, cualquier VPS (ADR 0007).
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* turbo.json* ./
COPY packages ./packages
COPY modulos ./modulos
COPY apps ./apps
# --frozen-lockfile en CI/prod; el fallback cubre un lockfile desincronizado en dev.
RUN pnpm install --frozen-lockfile || pnpm install

# Compila lo que necesita build (hoy: el panel Next → apps/panel/.next).
FROM deps AS build
RUN pnpm turbo build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# /salud (¿vivo?) y /listo (¿Postgres responde?) los sirve el proceso api.
# El panel se sirve con `next start` desde apps/panel/.next.
ENTRYPOINT ["/entrypoint.sh"]
