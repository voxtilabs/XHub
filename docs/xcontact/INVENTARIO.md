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
| Entregada por el cliente | `192.168.37.212` `:8004` y `:8011` | **Host distinto al del descubrimiento — confirmar cuál corresponde** |

Se llega por el túnel WireGuard de X5. El perfil entregado es de **túnel completo**
(`AllowedIPs = 0.0.0.0/0` + DNS propio): levantarlo tal cual secuestra todo el tráfico
de la máquina. Va en el contenedor del conector con túnel partido. Ver ADR 0010 e
issues de Fase 0.
