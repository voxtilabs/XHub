# Inventario de la API de xContact

Fuente: descubrimiento de `voxtilabs/Xcontactv2` (2026-09-08), sobre la instancia
de staging `192.168.37.250`. Este documento es el mapa que usa el conector; el
catálogo operación por operación vive en aquel repositorio.

## Lo que hay

| Dato | Valor |
|---|---|
| Swagger publicado | Xcontact REST API 3.9.14 — 461 rutas, 637 operaciones entre versiones |
| **API v4 inventariada** | **209 operaciones**, 165 rutas, 31 módulos de código |
| Modelos del contrato | 84 |
| Métodos | DELETE 29, GET 101, POST 49, PUT 30 |
| Autenticación | bearer en la práctica totalidad |

## Estado de verificación — lo que de verdad sabemos

| Estado | Operaciones | Significado |
|---|---:|---|
| D — documentado y ubicado | 187 | Existe en Swagger y su ruta está en el código. **No se ha ejecutado.** |
| L — lectura comprobada | 20 | Una consulta real respondió 200 |
| P — permiso insuficiente | 2 | Respondió 403; causa en los scopes del bearer |

> **Esto es lo que hace peligroso el trabajo:** de 209 operaciones, solo 20 se han
> visto responder. Las escrituras, el control de llamadas y el envío de mensajes están
> inventariados **por contrato y por código, no por ejecución**. Cada una es una
> hipótesis hasta que un escenario la confirme.

## Módulos v4 por dominio de xHub

### Identidad y sesión — 19 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `autenticacao_fontes` | Fuentes de autenticación | 7 |
| `usuario` | Usuarios y permisos | 7 |
| `2fa` | Doble factor | 3 |
| `login` | Sesión de supervisor | 2 |

### Personas y clasificación — 46 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `tags` | Etiquetado | 16 |
| `agrupamentos_tags` | Agrupaciones de etiquetas | 15 |
| `contato` | Contactos y clientes | 6 |
| `autocomplete` | Respuestas rápidas | 5 |
| `atendimento_campos_adicionais` | Campos de atención | 4 |

### Interacciones de voz — 43 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `agente` | Agentes | 20 |
| `fila` | Colas y grupos | 11 |
| `ligacao` | Control de llamadas | 8 |
| `video` | Grabaciones de video | 2 |
| `gravacao` | Grabaciones por protocolo | 1 |
| `pausas` | Pausas de agentes | 1 |

### Interacciones de texto — 31 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `chat` | Atención por chat | 14 |
| `ura_texto` | URA conversacional de texto | 9 |
| `canais_de_texto` | Canales de texto | 6 |
| `ura_fluxo` | Trazas de URA | 2 |

### Salientes y campañas — 33 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `lista_transmissao` | Listas de difusión | 20 |
| `campanhas` | Campañas | 13 |

### Configuración telefónica — 24 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `rota` | Enrutamiento | 11 |
| `contexto` | Contextos telefónicos | 5 |
| `tronco` | Troncales | 5 |
| `servidor` | Configuración y hora | 2 |
| `audio` | Audios del sistema | 1 |

### Reportes y gobierno — 13 operaciones

| Módulo v4 | Título | Ops |
|---|---|---:|
| `gmail_oauth2` | Correo Gmail OAuth2 | 6 |
| `pesquisas` | Encuestas de satisfacción | 4 |
| `log` | Auditoría de acceso | 1 |
| `metadados` | Vista previa de enlaces | 1 |
| `modulos` | Catálogo de módulos | 1 |

## Topología observada

- `xcontact-server` **3.9.14** — sirve v2/v3/v4, interno `127.0.0.1:8001`, publicado por nginx en **`:8004`** TLS.
- `xcontact-server-4` **4.3.0** — interno `127.0.0.1:8010`, publicado en **`:8011`**. **`/swagger.json` devuelve 404: sin contrato publicado.**
- `xcontact-chat-server` 1.0.4 · `xcontact-ami` 3.9.3 · Asterisk · nginx · PostgreSQL 16 · Redis · RabbitMQ.

## Trampas registradas

1. **Certificado TLS vencido** y con SAN de un nombre DNS, no de la IP. Ver ADR 0010.
2. **`:8004` responde 400 a HTTP plano** — siempre TLS.
3. **v5 no tiene Swagger.** El "follón" mencionado por el cliente tiene nombre: el servicio nuevo no publica contrato.
4. **El panel está en portugués** y su vocabulario se filtra a la API: `ligacao`, `fila`, `ramal`, `pausa`, `atendimento`.
5. **Módulos duplicados `_old`** en el panel (seis entradas): hay funciones viejas y nuevas conviviendo.
6. Incidente histórico registrado: observaciones truncadas a 255 caracteres.

## Direcciones

| Entorno | Dirección | Nota |
|---|---|---|
| Staging del descubrimiento | `192.168.37.250` | Donde se hizo el inventario |
| Producción | `10.0.0.71` | **No contactada** |
| Entregada por el cliente | `192.168.37.212` `:8004` y `:8011` | **Es la que usamos.** `xcontact-server` **3.9.15** |

Se llega por el túnel WireGuard de X5. El perfil entregado es de **túnel completo**
(`AllowedIPs = 0.0.0.0/0` + DNS propio): levantarlo tal cual secuestra todo el tráfico
de la máquina. Va en el contenedor del conector con túnel partido. Ver ADR 0010 e
issues de Fase 0.


---

## Verificación por el túnel — 2026-09-20

Conectado por WireGuard en túnel partido desde el contenedor `xcontact-gw`.
Handshake correcto; ambos hosts alcanzables.

### Las dos instancias no son la misma versión

| Host | Versión | Rutas | Operaciones | v4 | Modelos |
|---|---|---:|---:|---:|---:|
| `192.168.37.212` (la que nos dieron) | **3.9.15** | 464 | 640 | **212** | 214 |
| `192.168.37.250` (la del descubrimiento) | 3.9.14 | 461 | 637 | 209 | 213 |

**La diferencia es puramente aditiva**: 3.9.15 agrega tres operaciones y no quita
ninguna.

```
+ GET   /v4/email-oauth2/connect/{fila}
+ GET   /v4/email-oauth2/demo
+ POST  /v4/email-oauth2/update-fila/{fila}
```

Consecuencia: **el inventario de `Xcontactv2` sigue siendo válido** para la
instancia que vamos a usar. El contrato está congelado en
`docs/xcontact/swagger-v4.snapshot.json` (3.9.15, desde `.212`).

### El "follón" de v5 tiene nombre

`:8011` sirve **el paquete estático de Swagger UI sin configurar**: su
`swagger-initializer.js` sigue apuntando a `https://petstore.swagger.io/v2/swagger.json`,
el ejemplo de demostración que viene de fábrica. `/swagger.json` responde 404.

**No es que su contrato sea difícil: no hay contrato.** Nadie conectó esa UI a su
servicio. Cualquier trabajo sobre v5 exige que X5 entregue documentación o
configure su Swagger. Confirma ADR 0008: seguimos en v4.

### Comportamiento observado en `.212:8004`

| Prueba | Resultado | Lectura |
|---|---|---|
| `GET /api/v4/agente` sin bearer | **401** | La autenticación funciona como documenta el contrato |
| `GET /api/v4/ruta-inventada` | 404 | Distingue ruta inexistente de no autorizado |
| `GET /api/v4/contato` sin bearer | **404** | Ojo: no es 401. La ruta del módulo `contato` **no está donde el nombre sugiere** — hay que ubicarla en el contrato antes de asumirla |
| TLS **sin** `-k` | conexión rechazada | Certificado no válido para esa IP. Confirma ADR 0010: se resuelve con nombre o fijación, **no** desactivando la verificación |

El `404` de `/api/v4/contato` es exactamente el tipo de suposición que la matriz
de cobertura debe eliminar: el nombre del módulo en el código no es la ruta.

---

## v5 SÍ existe — es lo que usa la consola Xcontact4 (2026-09-22)

Corrección de lo dicho antes. `:8011` no es un servicio muerto ni el Swagger de
fábrica «a secas»: **es la API v5**, viva y en producción. Lo que no tiene es
contrato publicado.

Lo prueba el código de la consola nueva `/xcontact4/` (SPA Quasar/Vite). Su cliente
axios se arma así:

```js
const puerto = location.protocol === "http:" ? 8010 : 8011
axios.create({ baseURL: `${location.protocol}//${location.hostname}:${puerto}/api/v5` })
```

Es decir: **el único mapa de v5 que existe es el bundle de Xcontact4.** No hay
Swagger; hay un cliente compilado del que se pueden leer las rutas.

### Cómo autentica v5

- **Login de supervisor:** v5 **reutiliza v4** para esto — llama a
  `POST /v4/login/supervisor` (campos `nome`, `senha`, `duplo_fator`, `session_id`).
- Devuelve un `token` que trae `supervisores_modulos` (qué módulos ve el supervisor)
  y `nome`. Viaja como `Authorization: Bearer <token>`, igual que v4.
- Renovación propia de v5: `POST /auth/supervisor/refresh_token`. También hay
  `POST /auth/supervisor`.

### Rutas de v5 observadas en el bundle (parcial, solo lectura del código)

| Área | Rutas |
|---|---|
| Auth | `/auth/supervisor`, `/auth/supervisor/refresh_token` |
| Supervisión de agentes | `/supervisor/agentes/logoff`, `/supervisor/agentes/pausar`, `/supervisor/agentes/remover-filas` |
| Listas de transmisión | `/supervisor/lista-transmissao` (+ `agentes-disponiveis`, `filas-disponiveis`, `metricas`, `export.csv`, `lote/cancelar`) |
| Campañas de voz | `/campanhas-voz` (+ `blacklist`, `canais-virtuais`, `contextos-disponiveis`, `tags`, `layouts-importacao`, `importacao/preview`) |
| Telefonía | `/filas`, `/troncos`, `/voice/integrations`, `/xc-config/ddi_ddd_padrao` |
| WebRTC | `/webrtc/relatorio/sessoes` |

### Tiempo real por WebSocket

Xcontact4 usa **socket.io / engine.io**, no solo REST. Hay estado en vivo
(agentes, colas) que llega por socket y **no está en ninguna API REST**. Para el
conector eso significa: lo que se quiera reflejar «en vivo» en xHub o llega por
sondeo REST periódico, o exige hablar su socket — que no tiene contrato tampoco.

### Consecuencias para xHub

1. **La decisión sigue en pie: el conector se construye sobre v4** (ADR 0008), que
   es la única con contrato. Pero la razón se corrige: v5 no está abandonada, es la
   generación activa de supervisión. No nos integramos contra ella porque no publica
   contrato, no porque esté muerta.
2. **v5 reutiliza el login de v4.** Un mismo bearer de supervisor probablemente sirve
   para ambas; hay que verificarlo cuando lleguen las credenciales.
3. **La telefonía en vivo (agentes, colas, WebRTC) vive en v5 + socket.io**, no en
   v4 REST. Refuerza que xHub no intente ser la consola del supervisor: no podríamos
   replicar el tiempo real sin reimplementar su socket sin contrato.
4. **Hallazgo de seguridad de SU producto** (no del nuestro): el bundle de Xcontact4
   trae un `Bearer <token>` incrustado en el JavaScript público para un segundo
   cliente axios. Un token en código servido al navegador es un secreto quemado.
   Anotarlo para X5; no es acción nuestra.
