# Fixtures grabadas de la API de XContact

Respuestas **reales** de la instancia demo (`192.168.37.212`, v4 3.9.15), capturadas
el 2026-09-24 y **anonimizadas**. Su razón de ser: **desarrollar y probar el conector
sin túnel y sin la instancia de X5** (ADR 0004). El CI las usa; solo la suite de
contacto real (#68) necesita el túnel.

## Anonimización aplicada

- `senha` → `<hash-redactado>` · `token`/`session_id`/`refresh_token` → UUID cero
- `ip_login`/`pc_login`, sellos de fecha → valores fijos · 2FA → null
- Teléfonos → `+56900000000` · RUT → `11111111-1` · correos → `demo@example.cl`
- Verificado sin residuos de dato personal antes de subir.

## Contenido

| Archivo | Endpoint | Forma |
|---|---|---|
| `GET_v4_autenticacao_fontes_tipos.json` | `GET /v4/autenticacao/fontes/tipos` | lista[1] |
| `GET_v4_campanhas_temposMovimentos.json` | `GET /v4/campanhas/temposMovimentos` | objeto {registros,totais…} |
| `GET_v4_chats.json` | `GET /v4/chats` | lista[0] |
| `GET_v4_filas_ligacoes.json` | `GET /v4/filas/ligacoes` | envoltorio {dados,total} |
| `GET_v4_gruposFilas.json` | `GET /v4/gruposFilas` | objeto {error,total,message…} |
| `GET_v4_modulos.json` | `GET /v4/modulos` | lista[4] |
| `GET_v4_pausas.json` | `GET /v4/pausas` | lista[3] |
| `GET_v4_pesquisas_registros_totais.json` | `GET /v4/pesquisas/registros/totais` | lista[13] |
| `GET_v4_servidor_config.json` | `GET /v4/servidor/config` | lista[2] |
| `GET_v4_servidor_horario.json` | `GET /v4/servidor/horario` | objeto {timestamp…} |
| `GET_v4_tags.json` | `GET /v4/tags` | lista[0] |
| `GET_v4_usuarios.json` | `GET /v4/usuarios` | lista[1] |
| `POST_login_supervisor.json` | `POST /login/supervisor` | objeto {id,nome,senha,fullname…} |

> La demo está **vacía de datos de negocio**: varias listas vienen vacías.
> Sirven para la **forma** de cada respuesta, no para volumen. Cuando exista el
> entorno propio con datos sintéticos (#142) se re-graban con contenido real.
