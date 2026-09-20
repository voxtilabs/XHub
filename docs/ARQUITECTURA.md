# Arquitectura de xHub — plataforma central de X5 Soluciones

## Contexto

X5 Soluciones (x5s.cl) fabrica **xContact**, su plataforma de contactabilidad omnicanal: telefonía inbound/outbound, IVR, colas, call back, grabación, discador de campañas, WhatsApp, email, webchat, videoatención y XContact Flow. Es su producto estrella y el núcleo de su operación. **Nosotros no lo hicimos y no lo controlamos.** Su API está en Swagger, es difícil, tiene bugs, está en portugués y solo se alcanza por WireGuard.

VoxTi Labs debe construir **xHub**, y encima de él dos módulos nuevos: **xTickets** (tipo Zendesk) y **xCRM**. El pedido explícito es que xHub *no* sea un sanitizador de la API ajena, sino el **software central**: donde el superadmin crea clientes, les enciende módulos, les entrega su propia API con límites de uso, y donde **toda la información de todos los módulos vive junta**.

El caso que define el producto, en palabras del usuario: *si una persona manda un ticket, que quede registrado en el CRM cuando se necesite, y al revés*. Eso no se resuelve copiando datos entre módulos: se resuelve teniendo **una sola identidad de persona y una sola línea de tiempo** que todos los módulos comparten.

Restricciones confirmadas:
- **xContact sigue siendo el producto de atención.** El agente no se muda a xHub. xHub administra, consolida y suma módulos.
- **Despliegue en infraestructura de X5**, sobre una VPS con Dokploy. Por ahora se usa la de Bruno, pero **debe ser súper migrable**: mover todo a otra VPS no puede ser un proyecto.
- **Topología de xContact desconocida** (instancia única compartida vs. una por cliente) → se diseña para el caso general: N instancias.
- **Capacidades de integración desconocidas** (¿webhooks? ¿solo sondeo?) → se asume lo peor y se deja el enchufe listo.
- **Acceso ya entregado**: túnel WireGuard hacia la red de X5, y dos superficies de API en la misma máquina interna — `https://192.168.37.212:8004` (v1 a v4) y `https://192.168.37.212:8011` (v5, con problemas conocidos). **Conviven cuatro generaciones de API más una quinta en otro puerto**: eso no es un detalle de despliegue, es un requisito del conector.

Resultado buscado: una plataforma que pueda sostener módulos nuevos durante años sin reescribirse, y que sobreviva a que la API de la que depende sea frágil.

---

## 1. La decisión de fondo

**xHub es el sistema de registro. xContact es una fuente de datos, no la base de datos.**

De ahí se desprende todo lo demás:

- xHub tiene su propia base y guarda su **copia canónica** de lo que le importa de xContact. Las pantallas y los reportes **nunca** dependen de que la API ajena responda en ese instante.
- El "sanitizador" existe, pero es **un módulo adentro** —el conector— y es el único componente en todo el sistema que habla el vocabulario de xContact. Si mañana X5 cambia su API, se toca un módulo, no el producto.
- xTickets y xCRM no son aplicaciones separadas que se integran: son **módulos sobre un núcleo compartido**. No tienen "su" base de contactos.

```
┌──────────────────────── xHub ─────────────────────────┐
│                                                        │
│  Panel Superadmin (X5/VoxTi)   Panel Cliente           │
│  ───────────────────────────   ─────────────────       │
│                                                        │
│  NÚCLEO: identidad · clientes · permisos ·            │
│          entitlements · registro de módulos ·         │
│          API por cliente · cuotas · auditoría ·       │
│          eventos (outbox) · archivos · notificaciones │
│                                                        │
│  ESPINA DORSAL DE DATOS:                              │
│    Personas + identidades por canal                   │
│    Línea de tiempo de interacciones                   │
│    Enlaces entre objetos · etiquetas · campos         │
│                                                        │
│  MÓDULOS:  [conector xContact] [xTickets] [xCRM] ...  │
└────────────────┬───────────────────────────────────────┘
                 │ único punto de contacto
        ┌────────▼────────┐   WireGuard
        │  ACL xContact   │──────────────► API Swagger de X5
        │  (traductor)    │                (N instancias)
        └─────────────────┘
```

### 1.1 El límite se hace cumplir con la máquina, no con la buena voluntad

"Los módulos comparten información pero no se meten en la base del otro" es fácil de escribir y se rompe el primer martes apurado. Tres cercas automáticas:

1. **Un esquema Postgres por módulo** (`nucleo`, `tickets`, `crm`, `conector`), y el rol de aplicación **sin permisos sobre las tablas de los otros**. Si xTickets intenta leer una tabla de xCRM, Postgres lo rechaza. No es una convención: es un `GRANT` que no existe.
2. **Contrato tipado por módulo**: cada uno publica un paquete `@xhub/contrato-tickets` con lo que expone. Las lecturas entre módulos pasan por ahí, y una regla de dependencias en el CI prohíbe importar los internos de otro módulo.
3. **Consecuencia valiosa**: el día que un módulo tenga que salir a su propio servicio —porque creció o porque un cliente lo exige aislado— es una operación mecánica, no una reescritura. Empezamos monolito modular **sin cerrarnos la puerta**.

### 1.2 El núcleo es vendible solo

Vale la pena decirlo comercialmente, porque cambia el pitch: **xHub con la ficha 360 y su API tiene valor aunque el cliente no compre ni tickets ni CRM.** El cliente de xContact entra a xHub para ver a su gente, su historia y su consumo; xTickets y xCRM son ampliaciones que se encienden desde el panel.

Eso convierte la modularidad de un detalle técnico en el modelo de negocio: nadie compra "todo o nada", y cada módulo encendido es un aumento de contrato sobre un cliente que ya está adentro. Es lo que hace de xHub la cúspide del negocio y no una capa intermedia.

### 1.3 Una tensión que conviene resolver ahora con el jefe

"Modular" puede significar dos cosas distintas y solo una es compatible con compartir información de verdad:

- **Módulos que se encienden por cliente** pero se versionan y despliegan juntos → es lo que permite una sola persona, una sola historia, cero sincronización. **Es lo que propone este plan.**
- **Productos con su propio ciclo de vida y despliegue independiente** → obliga a APIs entre ellos, datos duplicados y consistencia eventual. Se puede, pero se pierde exactamente lo que el jefe está pidiendo.

Conviene tener esa conversación antes de la primera línea de código, no después.

---

## 2. Principios rectores

1. **Un solo dueño del dato.** Cada hecho vive en un módulo; los demás lo leen por contrato, jamás por SQL cruzado.
2. **El proveedor no tiene lógica de negocio.** Todo lo que sea regla de negocio vive en xHub. El conector solo traduce.
3. **Degradar, no caer.** Si xContact no responde, xHub sigue funcionando con su copia y lo dice en pantalla. El estado "no sé" es un estado propio, distinto de "está bien".
4. **Permisos por catálogo, nunca por rol.** Ninguna línea de código pregunta `rol === 'ADMIN'`; pregunta por permiso. El CI lo verifica con un grep bloqueante.
5. **Módulo apagado = no existe.** Si un cliente no tiene xCRM, sus rutas no se registran, sus permisos no se traducen y sus eventos no se consumen.
6. **Portabilidad antes que comodidad.** Nada propietario en el camino crítico. `docker compose up` + restore debe levantar el sistema en una VPS limpia.
7. **Todo lo que decide se audita.** Libro append-only con encadenamiento por hash; incluye los permisos denegados.
8. **La evidencia manda.** Antes de dar por buena una integración hay que verla funcionar contra la instancia real, no contra un mock.

---

## 3. La espina dorsal: por qué "toda la información queda junta"

Esta es la pieza que hace de xHub un producto y no un menú de aplicaciones.

### 3.1 Directorio de Personas con identidades por canal

Una tabla `personas` por cliente, y una tabla aparte `identidades` con `(canal, valor)` único por cliente:

| canal | valor | ejemplo |
|---|---|---|
| `telefono` | E.164 | +56912345678 |
| `email` | normalizado | juan@empresa.cl |
| `rut` | con DV validado | 12345678-5 |
| `xcontact` | id externo | contacto 8842 de la instancia A |
| `webchat` / `instagram` / … | id opaco | — |

**El teléfono no es la llave.** Quien escribe por webchat o abre un ticket por email puede no tener teléfono nunca. La llave es la identidad del canal por donde llegó; el emparejamiento entre canales es una operación explícita (`fusionar`), auditada, reversible en el sentido de que **nada se borra**: la persona absorbida queda marcada `fusionada_en` y sus identidades pasan a la principal.

### 3.2 Línea de tiempo de interacciones

Una tabla `interacciones` — apéndice puro, nunca se edita — donde **todos** los módulos escriben:

`(cliente, persona_id, tipo, ocurrio_en, origen_modulo, objeto_tipo, objeto_id, resumen, meta)`

Una llamada de xContact, un WhatsApp, un ticket creado, una oportunidad ganada, una nota: todo es una fila. Abrir una persona muestra **su historia completa** sin que ningún módulo consulte la base de otro.

Orden estable: `seq bigserial`, **no** `created_at`. En Postgres `now()` es fijo dentro de la transacción y dos filas de la misma transacción empatan; el orden quedaría al azar.

### 3.3 Enlaces entre objetos

Tabla `enlaces` genérica: `(origen_tipo, origen_id, tipo_enlace, destino_tipo, destino_id)`. Un ticket enlazado a una oportunidad, una oportunidad a una llamada grabada. Así se cumple *"el ticket queda en el CRM"* **sin duplicar el dato**: el ticket sigue siendo del módulo de tickets, y el CRM lo ve porque cuelga de la misma persona y está enlazado.

### 3.4 Cuándo el ticket "se registra" en el CRM

No se cablea. Es un **motor de reglas por cliente**, declarativo y apagable:

> cuando `ticket.creado` **y** la persona no tiene oportunidad abierta en el embudo *Postventa* → crear oportunidad y enlazarla.

Nace apagada, muestra "a quién afectaría hoy" antes de activarse, se audita cada disparo, y si el módulo destino está apagado la regla queda **pausada con aviso** en vez de fallar en silencio.

### 3.5 Encender xCRM después no migra nada

Un cliente puede contratar **solo xTickets** y funcionar perfecto. Mientras tanto, xTickets escribe personas, identidades e interacciones **en el núcleo**, no en una base propia. El día que ese cliente quiera xCRM, el superadmin enciende el módulo desde el panel y **la historia completa ya está ahí**: cada persona que alguna vez abrió un ticket, con su línea de tiempo entera.

Esto no es un efecto colateral afortunado, es el motivo de la espina dorsal, y tiene una consecuencia de diseño que hay que respetar sin excepciones: **ningún módulo guarda personas, identidades ni interacciones por su cuenta.** Si xTickets tuviera su propia tabla de contactos, encender xCRM exigiría una migración de datos por cliente — y esa migración, tarde o temprano, se hace mal.

Los módulos sí son dueños de **sus** objetos: el ticket es de xTickets, la oportunidad es de xCRM. Lo compartido es la persona, su historia y los enlaces.

---

## 4. La capa anticorrupción de xContact (el "sanitizador", bien hecho)

El conector es un módulo con un puerto (`ProveedorContactCenter`) y una implementación. Nada fuera de él sabe que existe el portugués.

**Cliente tipado congelado.** Se captura el Swagger, se genera cliente TypeScript y **el esquema queda versionado en el repo**. Un job compara periódicamente el Swagger vivo contra el snapshot y abre issue cuando deriva. Nunca generamos contra la API en tiempo de build.

**Traductor en un solo archivo.** `mapeo.ts`: nombres, enums, códigos de estado, formatos de fecha y zona horaria, paginación. Un solo lugar donde vive la rareza ajena, con un test por cada campo traducido.

**Fixtures grabadas.** Cada respuesta real observada se guarda anonimizada como fixture. Consecuencia práctica grande: **se desarrolla y se corre el CI sin WireGuard y sin la instancia de X5**. Solo las pruebas de contacto real necesitan el túnel.

**Política de fallo, porque la API se buguea:**
- Timeout agresivo por llamada, reintentos con retroceso exponencial solo en errores reintentables.
- **Cortacircuitos por instancia**: si una instancia falla sostenidamente, se abre, se marca `degradada` y se deja de golpear.
- **Límite de salida propio**: nosotros no reventamos su API. Balde de fichas en Redis por instancia.
- Idempotencia en todo lo que escribe: llave de operación única, reintento seguro.
- Cola de muertos con causa legible y reintento manual desde el panel.

**Sincronización en tres capas, de la más rápida a la más confiable:**
1. **Webhooks** si existen — enchufe listo aunque hoy no haya nada que enchufar.
2. **Sondeo con cursor** por tipo de objeto, intervalo configurable por instancia.
3. **Reconciliación periódica**: barrido completo de baja frecuencia que compara conteos y sellos de tiempo, reporta **deriva** y repara. Es la que detecta lo que los otros dos se pierden.

**Tablero de salud de la integración**: por instancia, última sincronización exitosa, latencia p95, tasa de error, tamaño de la cola de muertos, deriva detectada. `sin_fuente` ensucia el estado general a propósito.

**El túnel es infraestructura, no tarea del desarrollador.** Un contenedor `xcontact-gw` mantiene WireGuard y expone un proxy HTTP interno; los servicios salen por ahí. Nadie instala WireGuard en su laptop, y cambiar de túnel no toca código.

**N instancias desde el día uno.** `instancias_xcontact` (url base, **versión de API fijada**, referencia de credencial, referencia de túnel, salud) y `vinculos_cliente_instancia` (cliente → instancia + id externo). Si mañana resulta que hay una sola compartida, el modelo la cubre como caso de N=1. **Las credenciales se guardan por referencia** (nombre de variable de entorno), nunca el secreto en la base.

**La versión de API es parte de la configuración, no una constante.** En la instancia conocida conviven v1–v4 en `:8004` y v5 en `:8011`, y v5 "tiene un follón". El conector **fija la versión por instancia** y tiene una implementación del traductor por generación soportada; el código de negocio nunca pregunta la versión. Regla práctica: **elegir la versión más vieja que cumpla lo que necesitamos y esté estable** — en una API con cuatro generaciones vivas, la nueva suele ser la menos probada. v5 se evalúa en Fase 0 y se adopta solo si aporta algo que las anteriores no dan.

---

## 5. Multi-tenencia, identidad y permisos

- **Una base, RLS forzado.** `tenant_id` en toda tabla de negocio, política `FORCE ROW LEVEL SECURITY`, y el rol de aplicación **no es superusuario** — si lo fuera, Postgres ni evalúa las políticas y los tests mienten diciendo que estás protegido.
- Toda escritura pasa por un helper `conTenant(id, fn)` que fija la variable de sesión dentro de la transacción.
- **Dos poblaciones de usuarios separadas**: administradores de plataforma (X5/VoxTi, tabla propia, permisos `plataforma.*`, cruzan clientes) y usuarios de cliente (membresía + rol por cliente). Un administrador de un cliente **no** es superadmin y hay un test que lo prueba.
- **Catálogo de permisos** declarado por cada módulo en su manifiesto. Los roles son traducciones a conjuntos de permisos, en un único archivo.
- **Entitlements**: módulo encendido por cliente. El traductor de roles filtra por entitlement, así que apagar xCRM retira sus permisos de todos sus usuarios en la siguiente petición.
- **Modo soporte**: un superadmin puede entrar a un cliente, con motivo obligatorio, sesión corta, banner visible y cada acción registrada como `actuando_por`.

---

## 6. API por cliente, cuotas y control de consumo

Requisito explícito del usuario, y además es lo que hace a xHub vendible.

- Token `xhub_…` mostrado **una sola vez**; en la base solo `sha256`.
- El cliente se deduce **de la llave**, jamás de un header → cruzar clientes es imposible por construcción.
- **Scopes como techo**: el scope no puede exceder los entitlements del cliente.
- **Rate limit** por minuto en Redis (ráfaga) + **cuota mensual** por plan, con override del superadmin por cliente.
- Cabeceras `X-Cuota-*`, `429` con código estable, avisos automáticos al 80% y al 100%.
- **Tablero de consumo**: vivo (Redis) + volcado cada 5 min a métricas diarias. El cliente ve el suyo; el superadmin los ve todos.
- **Webhooks salientes** hacia el cliente con firma con marca de tiempo, secreto rotable, reintentos con retroceso y panel de entregas.

---

## 7. Stack y por qué

Monorepo **pnpm + Turborepo**, TypeScript en todo, **monolito modular** en NestJS, **Next.js** para los paneles, **Postgres 16** con RLS, **Redis + BullMQ**, almacenamiento **S3-compatible** detrás de una interfaz (MinIO on-prem o R2/S3), **OpenTelemetry** + Sentry.

- **Monolito modular, no microservicios.** El equipo es chico y los módulos comparten la espina dorsal. Se despliega como una imagen con varios puntos de entrada (api, workers, paneles) — se puede escalar cada uno por separado sin pagar el costo de red y de consistencia de los microservicios.
- **Postgres propio, no gestionado.** Es el requisito de migrabilidad: un `pg_dump`/restore y un compose levantan el sistema en cualquier VPS. Nada de Supabase ni RDS en el camino crítico.
- **Un registro de módulos** en el núcleo: cada módulo declara nombre, dependencias, permisos, eventos y migraciones. Colisiones y ciclos **abortan el arranque**, no se descubren en producción.
- **Migraciones por módulo, orden topológico.** Cada módulo trae las suyas; el corredor las ordena por dependencia.

---

## 8. Plataforma, operación y migrabilidad

La migrabilidad es requisito de arquitectura, no una tarea de infra al final.

- **Cero dependencia de Dokploy en el código.** Dokploy es el operador; el artefacto es un `docker-compose.yml` portable + un chart Helm equivalente. El sistema debe levantar igual con `docker compose up` a mano.
- **Todo por variable de entorno**, un `.env.example` exhaustivo, secretos por referencia. Ninguna URL ni credencial horneada en el build (ojo con `NEXT_PUBLIC_*`: quedan cocidas en la imagen de Next — la configuración del panel se lee en tiempo de ejecución).
- **Tráfico siempre por el proxy inverso**, nunca puertos del host publicados.
- **Respaldos**: Postgres diario cifrado + WAL continuo, objetos replicados, y **el respaldo sale del servidor** — un respaldo que vive en la misma VPS no cubre perder la VPS.
- **Ensayo de migración como criterio de salida**, no como promesa: restaurar en una VPS limpia, cronometrar, anotar lo que falló. Se repite cada trimestre.
- **Recuperación**: rollback a imagen anterior verificable desde afuera, con tiempos medidos y escritos. Un procedimiento que nunca se corre no está probado.
- **Observabilidad**: trazas OTel, errores a Sentry, métricas por cliente, y `/salud` (¿vivo?) separado de `/listo` (¿Postgres y Redis responden?). Confundirlos hace que un pod con la base caída se declare listo — o que reinicie en cadena por una base lenta.
- **Dato sensible de terceros en infra prestada**: mientras esté en la VPS de Bruno, cifrado en reposo, respaldo fuera, acceso nominativo y registro. Es lo primero que hay que migrar cuando X5 defina su VPS. Aplica la Ley 21.719.

---

## 9. Producto y negocio

- **Quién usa qué**: superadmin (X5/VoxTi) administra clientes, módulos, cuotas y salud. El cliente administra sus usuarios, su configuración y sus llaves. El agente **sigue en xContact**.
- **Lo que el superadmin hace desde el panel, en concreto**: crear un cliente y su suscripción; encender o apagar xTickets y xCRM por separado; ver el consumo de API de ese cliente y fijarle el tope mensual; revisar y activar sus automatizaciones; inspeccionar su configuración y su salud de integración; entrar en modo soporte con motivo y registro. Todo cambio queda auditado con quién y por qué.
- **Planes**: el plan define módulos habilitados, tope de usuarios, cuota de API y retención de datos. Los límites viven en tabla, no en código.
- **Onboarding de un cliente** (el camino que el superadmin recorre): crear cliente → vincular su instancia de xContact y su id externo → encender módulos → invitar a su administrador → primera sincronización → verificar en el tablero de salud.
- **Para X5 el valor** es que xContact gana tickets y CRM sin tocar su núcleo. **Para el cliente final** es una sola historia por persona en vez de tres sistemas.
- **Fuera de v1, dicho explícitamente**: bandeja de atención dentro de xHub, reemplazo de canales de xContact, apps móviles, marketplace de terceros. Si más adelante la bandeja migra, la espina dorsal ya la sostiene.

---

## 10. Plan de ejecución

**Fase 0 · Repositorio + descubrimiento de xContact — bloqueante y corta**
Crear `voxtilabs/xhub` con este documento, las ADRs y el backlog completo (§11). En paralelo: levantar el túnel **en túnel partido o en contenedor** (nunca completo, rompería la tailnet y el DNS de la máquina), capturar el Swagger de `:8004` (v1–v4) y de `:8011` (v5), **elegir la generación de API a adoptar**, inventariar los endpoints que importan (personas, interacciones, llamadas, campañas, agentes), medir el comportamiento real (autenticación, paginación, latencia, códigos de error, límites) y preguntarle a X5 lo de §14.
*Entregable*: `docs/xcontact/CONTRATO.md` + snapshot del Swagger de ambas superficies + fixtures grabadas + lista de bugs conocidos con su workaround + ADR de versión elegida.
*Salida*: sabemos qué se puede sincronizar y a qué costo, y el equipo puede desarrollar **sin túnel**. **Sin esto, cualquier estimación es inventada.**

**Fase 1 · Fundación**
Monorepo, CI bloqueante, imagen única con varios puntos de entrada, corredor de migraciones, RLS probada con rol no-superusuario, registro de módulos, identidad, clientes, autorización por catálogo, auditoría encadenada, outbox + colas, API base con errores uniformes, salud/listo, observabilidad, compose portable desplegado.
*Salida*: se crea un cliente, entra un usuario, queda en la bitácora, y el despliegue se hace solo desde `main`.

**Fase 2 · Espina dorsal**
Personas, identidades por canal, fusión auditada, línea de tiempo, enlaces, etiquetas, campos personalizados, adjuntos, búsqueda en español.
*Salida*: una persona creada a mano muestra su historia y acepta interacciones de cualquier origen.

**Fase 3 · Conector xContact**
Túnel como servicio, cliente tipado, traductor, las tres capas de sincronización, cortacircuitos, cola de muertos, tablero de salud, reconciliación.
*Salida — el esqueleto que camina*: un cliente real, su instancia real, sus personas e interacciones espejadas y visibles en xHub; se apaga la API de X5 y el panel **sigue mostrando todo** marcando la fuente como desactualizada.

**Fase 4 · Superadmin y control**
Panel de clientes, entitlements por módulo, llaves de API, rate limit y cuotas, consumo, explorador de auditoría, modo soporte.
*Salida*: apagar xCRM a un cliente le retira las rutas y los permisos en la siguiente petición.

**Fase 5 · xTickets** y **Fase 6 · xCRM** — **viven en otro repositorio** (§16). Lo que queda en xHub es lo que los habilita: el SDK de módulos, los contratos y un módulo de referencia que prueba que el SDK sirve.

**Fase 7 · Reglas y API pública** — motor de reglas entre módulos (incluido ticket ↔ oportunidad), API del cliente documentada, webhooks salientes, portal de desarrollador.

**Fase 8 · Endurecimiento** — DR ensayado, **migración de VPS ensayada**, pruebas de carga, retención y derechos del titular, revisión de seguridad.

---

## 11. Primer entregable: el repositorio y su backlog

El resultado inmediato de este plan no es código: es un **repositorio con el backlog completo**, al estilo de lo que ya funcionó en IAxTi — desglose de **todas** las fases, no solo de la primera.

**Repositorio** `voxtilabs/xhub`, monorepo, privado, con `CLAUDE.md`, `docs/ARQUITECTURA.md` (este documento), `docs/SPEC.md` y ADRs numeradas desde el día uno.

**ADRs de arranque** — las decisiones que no deben volver a discutirse sin un documento que las derogue:

| ADR | Decisión |
|---|---|
| 0001 | xHub es el sistema de registro; xContact es fuente de datos |
| 0002 | Monolito modular con registro de módulos, no microservicios |
| 0003 | Una base Postgres con RLS forzada y rol de aplicación no-superusuario |
| 0004 | Capa anticorrupción: un solo módulo habla el vocabulario de xContact |
| 0005 | Personas e interacciones viven en el núcleo, nunca en un módulo |
| 0006 | Permisos por catálogo; el rol nunca decide |
| 0007 | Portabilidad: contenedores y Postgres propio, sin servicios gestionados |
| 0008 | Versión de API de xContact fijada por instancia |

**Etiquetas**: `type:` (feature/bug/adr/spike/chore), `module:` (core/personas/conector/tickets/crm/plataforma/infra), `phase:` 0–8, `priority:`, `size:`, `status:blocked`, `needs:decision`.

**Milestones**: uno por fase de §10.

**Forma de cada issue**: contexto, alcance, criterio de salida **verificable desde afuera**, dependencias escritas como "Bloqueado por #n" en el cuerpo más la etiqueta `status:blocked`. Los que esperan algo de X5 nacen con `needs:decision` y el nombre del insumo que falta.

**Épicas paraguas** por fase, con el listado de hijos en un comentario.

Orden de creación: Fase 0 y 1 con el máximo detalle (son las que se ejecutan ya), el resto desglosado completo aunque con menos grano fino, y refinado al entrar en cada fase.

---

## 12. Leyes de la casa

Invariantes que el CI verifica, cada una porque su ausencia ya costó caro:

1. El rol de aplicación **no** es superusuario — con RLS activo y rol superusuario, las políticas ni se evalúan.
2. Ningún `rol === '…'` fuera del traductor de roles. Grep bloqueante.
3. El día es el **día del negocio** (`America/Santiago`) y viaja como texto `AAAA-MM-DD`. Nunca un `Date` a Postgres para comparar contra `::date`.
4. Orden de eventos por `seq`, jamás por `created_at`.
5. Los tests corren **contra una base real** en CI. Un paso verifica que la suite escribió filas; si no escribió nada, falla — una suite sin base pasa en verde tapando bugs reales.
6. Idempotencia en todo consumidor y en todo webhook entrante.
7. Nunca HTTP dentro de una transacción: se encola.
8. Auditoría append-only con trigger anti UPDATE/DELETE.
9. Migraciones aditivas; `IF EXISTS` en lo que depende del entorno.
10. Secretos por referencia, jamás el valor en la base.

---

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| La API de xContact es frágil y no la controlamos | ACL + copia canónica + cortacircuitos + fixtures; el producto funciona degradado |
| No sabemos si hay webhooks | Sondeo + reconciliación como base; webhooks como mejora enchufable |
| Topología desconocida (1 vs N instancias) | Modelo de N instancias desde el día uno; N=1 es un caso particular |
| Deriva del contrato ajeno sin aviso | Snapshot versionado + job de comparación que abre issue |
| WireGuard como cuello de botella humano | Túnel como contenedor de infraestructura + fixtures para desarrollar sin él |
| Datos de clientes de X5 en VPS prestada | Cifrado, respaldo fuera del servidor, migración ensayada temprano |
| xHub se vuelve un cuello de botella para X5 | Contrato de integración y SLA escritos con ellos en Fase 0 |

---

## 14. Decisiones abiertas — preguntas para X5

1. ¿Una instancia de xContact por cliente o una compartida? ¿On-premise en algún caso?
2. ¿Hay webhooks o algún mecanismo de eventos? Si no, ¿pueden agregarlos?
3. ¿Quién autentica al usuario final? ¿xHub puede ser el proveedor de identidad y xContact confiar, o cada uno mantiene su login?
4. ¿Límites de uso de su API? ¿A quién escalamos cuando falla, con qué compromiso de respuesta?
5. ¿Nos dan acceso de lectura a su base o solo API?
6. ¿Qué VPS será la definitiva y cuándo? ¿Quién opera: ellos o nosotros?
7. ¿Quién es el responsable legal de los datos de los clientes finales?

---

## 15. Verificación

Cada fase se da por cerrada solo con evidencia observable, no con código mergeado:

- **Aislamiento entre clientes**: test que intenta leer datos de otro cliente con rol de aplicación y recibe cero filas; y el mismo test contra un rol superusuario, que debe **fallar** — así se prueba que la prueba sirve.
- **Degradación**: se apaga el conector (o se corta el túnel) y el panel sigue sirviendo la ficha completa de una persona, marcando la fuente como desactualizada.
- **Entitlements**: apagar un módulo retira rutas (404) y permisos en la petición siguiente, verificado con `curl`.
- **Cuotas**: guion que agota la cuota de una llave y comprueba `429`, cabeceras y el aviso al 80%.
- **Esqueleto que camina (Fase 3)**: una persona real de xContact aparece en xHub con su línea de tiempo, y un ticket creado en xTickets aparece en esa misma línea.
- **Regla entre módulos**: crear un ticket dispara la oportunidad enlazada, una sola vez aunque el evento se reintente.
- **Migrabilidad**: restaurar respaldo en una VPS limpia, levantar con compose, medir el tiempo y anotarlo en `RESULTADOS-DR.md`. Es el criterio de salida de Fase 8 y se repite cada trimestre.
- **Contrato ajeno**: la suite de fixtures corre en CI sin túnel; una suite aparte, manual, corre contra la instancia real antes de cada release.


---

## 16. Dos repositorios, una sola base de datos

Decisión de Lino: **xTickets y xCRM van en un repositorio aparte** para poder concentrar el esfuerzo en xHub —y en particular en la API sanitizada, que es donde está el dolor real.

| Repositorio | Contiene |
|---|---|
| `voxtilabs/XHub` | Núcleo, espina dorsal de datos, **conector xContact (API sanitizada)**, panel superadmin, API por cliente, SDK de módulos |
| `voxtilabs/xhub-modulos` (después) | xTickets, xCRM y los módulos que vengan |

**La separación es de repositorio, no de arquitectura.** Los módulos siguen sin tener base propia: siguen escribiendo personas e interacciones en el núcleo. Lo que cambia es cómo llega el código, no dónde viven los datos.

### 16.1 El SDK de módulos

xHub publica a GHCR/npm privado tres paquetes versionados:

- `@xhub/sdk-modulo` — el contrato que un módulo implementa: manifiesto (nombre, dependencias, permisos, eventos, migraciones), registro de rutas, acceso al núcleo.
- `@xhub/contratos-nucleo` — tipos y operaciones del núcleo: personas, identidades, interacciones, enlaces, auditoría, eventos.
- `@xhub/ui` — componentes del sistema de diseño, para que los módulos se vean como el producto.

Un módulo del otro repo se compila a un paquete y **la imagen de xHub lo compone en tiempo de build**. Resultado: dos repos, dos equipos, dos ritmos de desarrollo — **un despliegue, una base, una persona**.

### 16.2 Versionado del SDK

SemVer estricto y **ventana de compatibilidad de dos versiones mayores**. Romper el SDK sin aviso deja al otro equipo sin poder desplegar, así que: cambio mayor se anuncia con issue, se documenta la migración, y el CI de xHub corre las pruebas del módulo de referencia contra el SDK nuevo antes de publicarlo.

### 16.3 Módulo de referencia

En este repo vive `modulos/ejemplo`: un módulo mínimo pero completo —manifiesto, migración propia, permiso propio, una ruta, un consumidor de evento y sus pruebas— que existe para dos cosas: **probar que el SDK sirve** antes de que el otro equipo lo sufra, y ser la plantilla desde la que se arranca xTickets.

---

## 17. Cómo trabajan varias personas a la vez

- **`main` protegida**: sin empuje directo, PR obligatorio, check `ci` verde del último commit, una aprobación. Nunca mergear con checks pendientes.
- **Una rama por issue**: `<tipo>/<n>-<resumen>` (`feat/42-conector-contactos`).
- **Issues pensadas para ir en paralelo**: cada una declara su módulo y sus dependencias como "Bloqueado por #n". Las que no dependen entre sí pueden tomarse a la vez.
- **`CODEOWNERS`** por carpeta, para que la revisión llegue a quien conoce esa zona.
- **Plantillas** de issue y de PR con el criterio de salida obligatorio.
- **Rama limpia desde `main`** siempre: una rama apilada sobre commits ya fusionados con squash deja el CI sin disparar y el PR no se puede validar.
