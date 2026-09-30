# Contrato de integración con XContact

**El documento único.** Quien llega nuevo lo lee y puede escribir una llamada
correcta sin preguntar. Todo lo de aquí está **verificado ejecutando** contra la
demo (`192.168.37.212`), salvo lo marcado como pendiente.

Detalle ampliado en los vecinos: [INVENTARIO](INVENTARIO.md),
[AUTENTICACION](AUTENTICACION.md), [COBERTURA](COBERTURA.md),
[PARAMETROS](PARAMETROS.md), y las [fixtures](../../modulos/conector/fixtures/).

## 1. Qué es y dónde vive

XContact es single-tenant: **una instalación por cliente** (probado — sus 214
modelos no tienen ni un campo de inquilino). No hay separación interna; el
aislamiento es la VPS.

| Concepto | Valor |
|---|---|
| Servidor | `xcontact-server` — v4 es **3.9.15** en `.212`, 3.9.14 en `.250` |
| API a usar | **v4**, publicada por nginx en `:8004` (TLS → `127.0.0.1:8001`) |
| API v5 | `:8011`, `/api/v5` — activa (la usa la consola Xcontact4) pero **sin contrato publicado**. No la usamos |
| Contrato congelado | `docs/xcontact/swagger-v4.snapshot.json` (212 ops v4) |

## 2. Cómo se llega

Por el túnel WireGuard de X5, **en contenedor con túnel partido** (`xcontact-gw`).
Nunca túnel completo: rompe el DNS y la tailnet del host. Certificado TLS **no
válido** para la IP → verificar por nombre o fijación, jamás desactivar (ADR 0010).

## 3. Autenticación

```
POST /api/v4/login/supervisor      body: { "nome": "...", "senha": "..." }
→ 200 { token, session_id, modulos, ... }

Authorization: Bearer <token>      en todas las demás llamadas
```

Sin el prefijo `Bearer`, 401. El login deja `ip_login`/`pc_login` en el servidor →
usar credencial de **integración**, no de una persona. La demo es `admin`/`admin`.

## 4. Las cinco reglas que evitan el 90% de los errores

1. **La ruta sale del contrato, NUNCA del nombre del módulo.** `fila`→`/filas`,
   `chat`→`/chats`, `agrupamentos_tags`→`/agrupamentos-tags`, `contato` sin listado.
2. **Fechas `AAAA-MM-DD`**, horas `HH:MM`. Ojo: unos endpoints usan `data_ini`,
   otros `dataini` (sin guion). Inconsistencia real suya.
3. **Arrays: parámetro repetido sin corchetes.** `status=Atendida&status=Ocupado`.
   Los `[]` y la coma se rechazan.
4. **Listados con envoltorio** `{ error, full, total, message, dados: [...] }`.
   Elementos en `dados`, paginar por `total`.
5. **Sus errores filtran SQL crudo.** El traductor (#51) debe atraparlo: un 422
   puede traer la consulta entera o `there are no references to vCliente`.

## 5. Enumeraciones conocidas (para el traductor)

- **Estado de llamada:** `Atendida`, `Abandonada`, `Transbordou`, `Não atendida`,
  `Ocupado`, `Falha`.
- El árbol de `modulos` del login = permisos del supervisor. Los nombres son
  `app.xxx` en portugués (ver INVENTARIO §módulos del panel).

## 6. Rutas núcleo para la espina dorsal

| Necesidad xHub | Endpoint | Estado |
|---|---|---|
| Persona por teléfono | `GET /v4/contato/findCliente/{Numero}` | ✅ (única vía; no hay listado) |
| Ficha de contacto | `GET /v4/contato/{AgenteFullName}/{ContatoID}` | por verificar con datos |
| Llamadas | `GET /v4/filas/ligacoes?data_ini=&data_fim=` | ✅ envoltorio |
| Mensajes por cliente | `GET /v4/getMessagesByCliente?idCliente=&max=&page=` | ✅ |
| Atenciones (línea de tiempo) | `GET /v4/atendimentos` | ⚠️ 422 por vista SQL rota en demo — verificar en entorno propio |
| Etiquetas | `GET /v4/tags`, `/v4/tags/grupos` | ✅ |
| Agrupaciones de etiquetas | `GET /v4/agrupamentos-tags` | 🔒 403 — falta scope |
| Agentes / colas | `GET /v4/agente`, `/v4/gruposFilas` | ✅ |
| Canales en vivo | `GET /v4/ligacao/canais_ativos` | 🔒 403 — falta scope |

## 7. Lo que sigue en manos de X5

- **Scopes** para `agrupamentos-tags` y `ligacao/canais_ativos` (hoy 403) — #9.
- Un **entorno propio con datos sintéticos** para probar escrituras y `atendimentos` — #142.
- Decisión de **cómo llegan los datos** en producción (webhooks / agente / túneles) — #134.
- Confirmar host oficial de pruebas y renovar el **certificado** — #2.
- **Webhooks**: ¿existen o pueden agregarlos? — #134.
- Dos **hallazgos de seguridad de su producto** para avisarles: el login devuelve
  el hash MD5 de la clave, y el bundle de Xcontact4 trae un Bearer incrustado.

## 8. Riesgos abiertos del lado de su API

- `/v4/atendimentos` —el endpoint central de la línea de tiempo— roto en la demo
  por una vista SQL ausente. Si pasa en un cliente, el conector debe degradar y
  avisar, no romperse.
- Cuatro generaciones de API conviviendo (v1–v4) + v5 aparte: XContact agrega sin
  retirar. Seremos la generación N+1; no contar con que cambien nada de su lado.
- ⚠️ `GET /v4/chats/encerrarAllAtendimentosAguardando` (verbo de acción sobre un GET):
  el conector usa **lista blanca** de lecturas, nunca negra.

## Taxonomía de errores del proveedor (#51)

`clasificarError(status, cuerpo)` (`modulos/conector/src/resiliencia.ts`) mapea cada fallo a UNA categoría, y `esReintentable(cat)` decide la reacción. Ante un 403, un 500 y un cuerpo inesperado el conector reacciona distinto y registra la causa:

| Categoría | Cuándo | Reacción |
|---|---|---|
| `transitorio` | `429`, `5xx`, o red caída recuperable | **Reintentar** con retroceso; alimenta el cortacircuitos |
| `permiso` | `401`, `403` | **No** reintentar; renovar bearer (401) o avisar falta de scope (403, #9) |
| `contrato` | `422` con SQL/`vCliente`/«no references» filtrado | **No** reintentar; abrir issue de **deriva** del contrato ajeno |
| `dato` | `400`/`422` de validación | **No** reintentar; registrar el dato rechazado |
| `caida` | sin status / status 0 | Abrir el **cortacircuitos** de esa instancia |

Verificado en `modulos/conector/test/resiliencia.test.ts` ("clasificar errores de XContact y decidir reintento").
