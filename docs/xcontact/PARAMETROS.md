# Parámetros y comportamiento real de los endpoints clave

Deducido del contrato y **confirmado ejecutando** contra la demo (2026-09-23).
Es lo que el cliente tipado (#46), la paginación (#52) y el traductor (#49) necesitan.

## Reglas transversales de la API v4

Aprendidas de sus propios mensajes de error:

1. **Fechas: `AAAA-MM-DD`** en `data_ini`/`data_fim`; horas `HH:MM` en `hora_ini`/`hora_fim`.
2. **Arrays: parámetro repetido SIN corchetes.** `status=Atendida&status=Ocupado`.
   La forma `status[]=x` la **rechaza** (`"status[]" is not allowed`), y la coma
   `status=x,y` también.
3. **Envoltorio de listado:** `{ error, full, total, message, dados: [...] }`.
   Los elementos van en `dados`; `total` pagina.
4. **Los errores SQL se filtran crudos al cliente.** Un 422 puede devolver la
   consulta SQL entera o `there are no references to vCliente`. El traductor de
   errores (#51) debe atrapar esto y **nunca** dejar que llegue a una pantalla de xHub.

## `/v4/atendimentos` — el núcleo de la línea de tiempo

`GET /v4/atendimentos` — "Obtém os chats" (las atenciones omnicanal).

Filtros (todos query, opcionales en el contrato): `filas[]`, `agentes[]`,
`protocolo[]`, `cliente[]`, `data_ini`, `data_fim`, `hora_ini`, `hora_fim`,
`status[]` (array — repetido sin corchetes).

⚠️ **En la demo devuelve 422**: `vAtendimentosOmnichannel: there are no references
to vCliente`. Es una **vista SQL rota/ausente en esta instalación**, no un problema
de la petición. Riesgo real: si esto pasa en una instancia de cliente, el endpoint
central de la línea de tiempo no responde. El conector debe degradar y avisarlo, no
romperse. **A verificar en el entorno propio con datos (#142).**

## `/v4/filas/ligacoes` — llamadas de las colas ✅

`GET`, responde 200. Filtros: `data_ini`, `data_fim`, `hora_ini`, `hora_fim`,
`calldate[]`, `status[]`, `filas[]`. Envoltorio `{dados, total, full}`.

**Enum de `status` de una llamada** (la API lo reveló al rechazar un valor inválido):
`Atendida`, `Abandonada`, `Transbordou`, `Não atendida`, `Ocupado`, `Falha`.
→ Tabla directa para `mapeo.ts`: estos son los estados en portugués que traducimos.

## `/v4/getMessagesByCliente` — mensajes por cliente ✅

`GET`, 200. Query: `idCliente` (integer), `max` (`-1` = todos), `page`, `agente`.
Paginación por `page`/`max`.

## `/v4/pesquisas/registros/totaisPeriodo`

`GET`. Query: `dataini`/`datafim` (ojo: **sin guion bajo**, distinto de los otros
endpoints — inconsistencia real de su API), y **`periodo` es obligatorio de facto**
(sin él, 400 "Parâmetro de período inválido"). Con `periodo=dia` devolvió un 422 con
la SQL cruda — otro caso del punto 4.

## `/v4/contato/findCliente/{Numero}` — buscar persona por teléfono ✅

`GET`, 200. `Numero` en la ruta. Es **la** vía de entrada a personas desde XContact:
no hay listado de contactos, se busca por número. Alimenta directamente la tabla de
personas de la espina dorsal.

## Inconsistencias de nombres a tener presentes

- `data_ini`/`data_fim` en unos endpoints; `dataini`/`datafim` en `pesquisas`.
- `fila`→`/filas`, `chat`→`/chats`, `agrupamentos_tags`→`/agrupamentos-tags`.
- El nombre del módulo del inventario **nunca** es la ruta. Siempre del contrato.
