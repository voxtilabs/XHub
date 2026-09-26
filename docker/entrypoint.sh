#!/usr/bin/env sh
# Elige el proceso por XHUB_PROCESO. Un valor desconocido falla con mensaje claro,
# no arranca algo al azar.
set -e
case "${XHUB_PROCESO:-api}" in
  api)     echo "[xhub] proceso: api"     ; exec node apps/api/dist/main.js 2>/dev/null || { echo "api aún no construida"; sleep infinity; } ;;
  workers) echo "[xhub] proceso: workers" ; exec node apps/workers/dist/main.js 2>/dev/null || { echo "workers aún no construidos"; sleep infinity; } ;;
  panel)   echo "[xhub] proceso: panel"   ; exec node apps/panel/server.js 2>/dev/null || { echo "panel aún no construido"; sleep infinity; } ;;
  *) echo "XHUB_PROCESO desconocido: '${XHUB_PROCESO}'. Válidos: api, workers, panel." >&2; exit 1 ;;
esac
