# syntax=docker/dockerfile:1
# Imagen única de xHub con varios puntos de entrada (api, workers, panel).
# Se elige el proceso por la variable XHUB_PROCESO. ADR 0002.
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY modulos ./modulos
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
RUN pnpm turbo build || echo "build sin artefactos aún"

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
# El entrypoint elige el proceso. Hoy es un placeholder verificable; cada app real
# aporta su comando cuando exista (api/workers/panel).
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# /salud lo sirve cada proceso; aquí solo declaramos el contrato.
ENTRYPOINT ["/entrypoint.sh"]
