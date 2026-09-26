# syntax=docker/dockerfile:1
# Imagen única de xHub con varios puntos de entrada (migrate, api, workers, panel).
# El proceso se elige por XHUB_PROCESO (ADR 0002). Corre TypeScript directo con tsx:
# sin paso de build que se rompa entre una VPS y otra — máxima portabilidad (ADR 0007).
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

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# /salud (¿vivo?) y /listo (¿Postgres responde?) los sirve el proceso api.
ENTRYPOINT ["/entrypoint.sh"]
