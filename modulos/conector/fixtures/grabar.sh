#!/usr/bin/env bash
# Regraba las fixtures desde la instancia demo, a través del túnel xcontact-gw.
# Uso: ./grabar.sh   (requiere el contenedor xcontact-gw arriba)
set -euo pipefail
HOST="${XCONTACT_HOST:-192.168.37.212:8004}"
G="docker exec xcontact-gw"
OUT="$(dirname "$0")/v4"
TOK=$($G curl -sk -X POST "https://$HOST/api/v4/login/supervisor" \
      -H 'Content-Type: application/json' -d '{"nome":"admin","senha":"admin"}' \
      | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
grab(){ $G curl -sk "https://$HOST/api$1" -H "Authorization: Bearer $TOK" > "$OUT/$2"; echo "$2"; }
grab /v4/modulos GET_v4_modulos.json
grab /v4/servidor/config GET_v4_servidor_config.json
grab /v4/pausas GET_v4_pausas.json
grab /v4/usuarios GET_v4_usuarios.json
grab "/v4/filas/ligacoes?data_ini=2026-01-01&data_fim=2026-12-31" GET_v4_filas_ligacoes.json
echo "Recuerda: anonimizar antes de commitear (ver README.md)."
