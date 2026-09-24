# Matriz de cobertura de la API v4 — verificada contra la demo

Barrido de lectura del 2026-09-23 contra `192.168.37.212` (demo, `admin`/`admin`),
sobre los **51 endpoints GET sin parámetros de path** de los dominios que alimentan la
espina dorsal de xHub. Ejecutado, no supuesto.

**Leyenda de estado:** `200` responde · `403` la credencial de supervisor no alcanza
(scope) · `400/422` existe pero exige parámetros de query (fecha, id, etc.).

**Resumen:** 30 responden · 7 sin scope · 14 piden parámetros.

## Personas y clasificación

| Ruta | Estado | Forma |
|---|---|---|
| `/v4/agrupamentos-tags` | 🔒 403 | — |
| `/v4/agrupamentos-tags/por-fila` | 🔒 403 | — |
| `/v4/autocompletes` | ✅ 200 | vacío |
| `/v4/campanhas/registrosTags` | ✅ 200 | objeto |
| `/v4/chats/tags` | ◐ 422 | — |
| `/v4/chatsTags` | ✅ 200 | objeto |
| `/v4/filas/ligacoesTags` | ✅ 200 | objeto |
| `/v4/tags` | ✅ 200 | vacío |
| `/v4/tags/grupos` | ✅ 200 | vacío |

## Voz: llamadas, agentes, colas

| Ruta | Estado | Forma |
|---|---|---|
| `/v4/agente` | ✅ 200 | vacío |
| `/v4/agente/clientes_por_assunto` | ◐ 400 | — |
| `/v4/contextos` | ✅ 200 | vacío |
| `/v4/filas/agente_web/gravacao` | ◐ 400 | — |
| `/v4/filas/downloadgravacao` | ◐ 400 | — |
| `/v4/filas/gravacao` | ◐ 400 | — |
| `/v4/filas/ligacoes` | ✅ 200 | envoltorio |
| `/v4/gmail-oauth2/filas` | ✅ 200 | objeto |
| `/v4/gruposFilas` | ✅ 200 | objeto |
| `/v4/ligacao/canais_ativos` | 🔒 403 | — |
| `/v4/ligacoes/downloadgravacao` | ◐ 400 | — |
| `/v4/ligacoes/gravacao` | ◐ 400 | — |
| `/v4/pausas` | ✅ 200 | lista |
| `/v4/rotas` | ✅ 200 | vacío |
| `/v4/troncos` | ✅ 200 | vacío |

## Texto: chat y URA

| Ruta | Estado | Forma |
|---|---|---|
| `/v4/canaisDeTexto` | ✅ 200 | vacío |
| `/v4/chats` | ✅ 200 | vacío |
| `/v4/chats/alertaAtendimentosAguardando` | ✅ 200 | vacío |
| `/v4/chats/anexo` | ◐ 400 | — |
| `/v4/chats/encerrarAllAtendimentosAguardando` | ✅ 200 | objeto |
| `/v4/ura_fluxo` | 🔒 403 | — |
| `/v4/ura_texto` | 🔒 403 | — |

## Salientes: campañas y difusión

| Ruta | Estado | Forma |
|---|---|---|
| `/v4/campanhas/temposMovimentos` | ✅ 200 | objeto |

## Gobierno: módulos, usuarios, servidor

| Ruta | Estado | Forma |
|---|---|---|
| `/v4/logs` | 🔒 403 | — |
| `/v4/modulos` | ✅ 200 | lista |
| `/v4/pesquisas/registros` | ✅ 200 | objeto |
| `/v4/pesquisas/registros/totais` | ✅ 200 | lista |
| `/v4/pesquisas/registros/totaisPeriodo` | ◐ 400 | — |
| `/v4/pesquisas/registrosExport` | ◐ 400 | — |
| `/v4/servidor/config` | ✅ 200 | lista |
| `/v4/servidor/horario` | ✅ 200 | objeto |
| `/v4/usuarios` | ✅ 200 | lista |

## Otros

| Ruta | Estado | Forma |
|---|---|---|
| `/v4/2fa` | ✅ 200 | objeto |
| `/v4/atendimentos` | ◐ 422 | — |
| `/v4/audios` | ◐ 400 | — |
| `/v4/autenticacao_fontes` | ✅ 200 | vacío |
| `/v4/autenticacao_fontes/tipos` | ✅ 200 | lista |
| `/v4/email-oauth2/demo` | 🔒 403 | — |
| `/v4/getMessagesByCliente` | ◐ 422 | — |
| `/v4/gmail-oauth2/callback` | ◐ 400 | — |
| `/v4/listas_transmissoes` | ✅ 200 | vacío |
| `/v4/regras_transbordo` | ✅ 200 | vacío |

## Lo que esto decide

### Scopes a pedir a X5 (#9)
La credencial de supervisor de la demo **no alcanza** estos siete, todos con 403:
`/v4/ura_texto`, `/v4/ura_fluxo`, `/v4/logs`, `/v4/agrupamentos-tags`,
`/v4/agrupamentos-tags/por-fila`, `/v4/ligacao/canais_ativos`,
`/v4/email-oauth2/demo`. De ellos, **`agrupamentos-tags` y `canais_ativos` importan
para la espina dorsal** (agrupaciones de etiquetas y estado de llamadas en vivo) →
hay que pedir esos scopes explícitamente.

### Endpoints que exigen parámetros (400/422)
No son fallos: piden filtros. Los de interés para el conector:
- `/v4/atendimentos` (422) — las atenciones, núcleo de la línea de tiempo. Pide filtro.
- `/v4/getMessagesByCliente` (422) — mensajes por cliente. Pide el id de cliente.
- `/v4/filas/gravacao`, `/v4/ligacoes/gravacao` (400) — grabaciones, piden id.
- `/v4/pesquisas/registros/totaisPeriodo` (400) — pide rango de fechas.

Cada uno necesita descubrir sus parámetros exactos del contrato antes de usarlo.

### Nombre del módulo ≠ ruta (confirmado a escala)
`fila`→`/filas`, `chat`→`/chats`, `agrupamentos_tags`→`/agrupamentos-tags` (guion,
no guion bajo). El conector toma la ruta del contrato, nunca del nombre.

### ⚠️ Verbos de acción tras un GET
`/v4/chats/encerrarAllAtendimentosAguardando` respondió **200 a un GET** y su nombre
significa "cerrar todas las atenciones en espera". Un GET no debería tener efectos.
**Marcado como riesgo:** el conector jamás debe llamar rutas con verbo imperativo
durante un barrido de lectura. Hay que verificar en el entorno propio (no en uno con
datos reales) si ese GET realmente ejecuta la acción. Es justo el tipo de trampa que
obliga a una lista blanca de lecturas, no una negra.
