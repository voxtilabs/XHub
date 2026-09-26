#!/usr/bin/env sh
# Un solo artefacto, varios procesos (ADR 0002): XHUB_PROCESO elige cuál. Un valor
# desconocido falla con mensaje claro, no arranca algo al azar.
#
# El runtime corre TypeScript directo con tsx: los paquetes del workspace exponen su
# `src` como main, así que no hay paso de build que se pueda romper entre la VPS de
# hoy y la de mañana. Menos piezas móviles = más migrable.
set -e
TSX="node_modules/.bin/tsx"

case "${XHUB_PROCESO:-api}" in
  migrate)
    echo "[xhub] proceso: migrate"
    exec "$TSX" packages/db/src/cli-migrar.ts
    ;;
  api)
    echo "[xhub] proceso: api"
    exec "$TSX" apps/api/src/main.ts
    ;;
  workers)
    echo "[xhub] proceso: workers"
    echo "[xhub] workers todavía no tiene app propia (los consumidores se despachan aún a mano); inerte" >&2
    exec sleep infinity
    ;;
  panel)
    echo "[xhub] proceso: panel"
    echo "[xhub] panel todavía no está cableado como app Next ejecutable; inerte" >&2
    exec sleep infinity
    ;;
  *)
    echo "XHUB_PROCESO desconocido: '${XHUB_PROCESO}'. Válidos: migrate, api, workers, panel." >&2
    exit 1
    ;;
esac
