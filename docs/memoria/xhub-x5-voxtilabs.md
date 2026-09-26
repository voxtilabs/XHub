---
name: xhub-x5-voxtilabs
description: "xHub — plataforma central que VoxTi Labs construye para X5 Soluciones sobre XContact; arquitectura, repo con 99 issues y lo medido de su API"
metadata: 
  node_type: memory
  type: project
  originSessionId: 54199078-31e3-4734-ad13-2bb939444ccc
  modified: 2026-09-21T00:50:22.941Z
---

**X5 Soluciones** (x5s.cl) fabrica **XContact**, su plataforma de contactabilidad
omnicanal (telefonía Asterisk inbound/outbound, IVR, colas, discador, grabación,
WhatsApp, email, webchat, videoatención). **No lo hicimos nosotros.** VoxTi Labs ya
les hizo el sitio de marketing (`~/xcontact-website`) y ahora construye **xHub**.

**La decisión de fondo (2026-09-20):** xHub **no** es un sanitizador de su API, es
**el sistema de registro**. Guarda copia canónica de lo que necesita de XContact; las
pantallas nunca dependen de que su API responda. El "sanitizador" es **un módulo
adentro** — el conector / capa anticorrupción — único lugar del sistema que habla su
vocabulario en portugués.

**Lo que hace que "todo esté junto"** (pedido literal de Lino: que un ticket quede en
el CRM y viceversa): personas + identidades **por canal** + línea de tiempo de
interacciones + enlaces, todo en el **núcleo**, nunca en un módulo. Consecuencia
vendible: un cliente puede tener solo xTickets y encender xCRM después **sin migrar
nada**, porque la historia ya está ahí. El teléfono **no** es la llave.

**Repositorio `voxtilabs/XHub`** (privado): `docs/ARQUITECTURA.md`, 10 ADRs,
`docs/xcontact/INVENTARIO.md`, CI/CD completo, rama `main` protegida (PR obligatorio
+ check `ci`, 0 aprobaciones por ahora), plantillas de issue/PR, CODEOWNERS.
**99 issues** en 7 milestones: Fase 0 descubrimiento, 1 fundación, 2 espina dorsal,
**3 conector (35 issues, la más grande — ahí está el riesgo)**, 4 superadmin+SDK,
7 reglas+API pública, 8 endurecimiento. Solo 7 llevan `needs:x5`.
**xTickets y xCRM van a otro repo** (`voxtilabs/xhub-modulos`, aún sin crear) y
consumirán `@xhub/sdk-modulo`: separación de repositorio, **no** de base de datos.

**Medido por el túnel el 2026-09-20** (lo importante):
- El perfil WireGuard que dio el cliente es de **túnel completo** (`0.0.0.0/0` + DNS
  propio): levantarlo en la máquina secuestra la tailnet y el DNS. Se levanta en
  contenedor con `AllowedIPs = 192.168.37.0/24, 10.0.0.0/24` y el host ni se entera.
- **`192.168.37.212` corre 3.9.15 (212 ops v4); `192.168.37.250` corre 3.9.14 (209).**
  La diferencia es aditiva (3 ops de `email-oauth2`), así que el inventario previo
  de `voxtilabs/Xcontactv2` sigue valiendo. Producción es `10.0.0.71`, sin tocar.
- **El "follón" de v5 es ausencia, no complejidad**: `:8011` sirve el Swagger UI de
  fábrica, todavía apuntando a `petstore.swagger.io`, y su `/swagger.json` da 404.
  No hay contrato. Se sigue en v4 (ADR 0008).
- Su **certificado TLS no valida** para esa IP → se resuelve por nombre o fijación,
  nunca desactivando la verificación (ADR 0010).
- `GET /api/v4/agente` sin bearer da **401**, pero `/api/v4/contato` da **404**: el
  nombre del módulo en su código **no es la ruta**. No asumir rutas por el inventario.

**El descubrimiento previo vive en `voxtilabs/Xcontactv2`**: catálogo de las 209
operaciones v4 en 31 módulos, 84 modelos, evidencia real de staging y scripts. De
esas 209, **solo 20 se han visto responder** — el resto es contrato y código, no
ejecución. Tratar cada una como hipótesis.

Ver [[iaxti-crm-voxtilabs]] (de donde salen los patrones reutilizados) y
[[palena-infra-vps]].

**Avance 2026-09-24 (sesión larga):** Fase 0 cerrada con evidencia real vía túnel.
Login supervisor demo = **admin/admin** (POST /api/v4/login/supervisor {nome,senha} →
token UUID, va como `Authorization: Bearer`). Verificado: nombre de módulo ≠ ruta
(fila→/filas, chat→/chats, contato sin listado); fechas AAAA-MM-DD; arrays repetidos
sin corchetes; listados con envoltorio {dados,total,full}; enum estado de llamada
(Atendida/Abandonada/Transbordou/Não atendida/Ocupado/Falha). **v5 = /api/v5 en :8011,
activa (la usa la consola Xcontact4) pero SIN contrato — seguimos en v4.** Bugs de SU
producto: login devuelve hash MD5 de la clave, y hay un Bearer incrustado en el JS
público de Xcontact4. `/v4/atendimentos` (núcleo línea de tiempo) roto en demo por
vista SQL `vCliente` ausente. Docs en `docs/xcontact/` (INVENTARIO, AUTENTICACION,
COBERTURA, PARAMETROS, CONTRATO) + 12 fixtures anonimizadas en modulos/conector/fixtures/.
Issues #2,5,6,7,8,12 cerradas; abiertas dependen de X5 (#9 scopes, #11/#134 webhooks,
#142 entorno propio, #4 peer wg).
**Fase 1 iniciada:** monorepo pnpm10+Turborepo compila; `@xhub/ui` con sistema de
diseño **"Consola X5"** derivado de x5s.cl (naranja acción #ff7a1a, cyan señal #75d8ee,
azul-abismo #05070a; ley "un solo naranja/cyan no se clickea"/"sin hex sueltos" con test).
Tokens en packages/ui/src/tokens.css (fuente única de color), doc en docs/diseno/SISTEMA.md.
Referencia de marca: repo local ~/xcontact-website (.impeccable/design.json, DESIGN.md).
Túnel: contenedor `xcontact-gw` (wg-quick, túnel partido 192.168.37.0/24). CI: pnpm
version NO duplicar (solo packageManager); verificación de base condicionada a que
existan migraciones (#17).

**Decisión de Lino (2026-09-24):** **Sentry lo paga X5, así que NO se cablea todavía.**
`@xhub/telemetry` registra errores en local (stderr estructurado); un test prueba que
un SENTRY_DSN en el entorno NO activa nada. OTel sí puede activarse por endpoint (no
cuesta igual). El único punto donde se conectaría Sentry es `capturarError()`.
**Avance Fase 1 (2026-09-24):** mergeados además: colas BullMQ (#27, cola de muertos;
BullMQ v5 prohíbe ':' en nombre de cola→usar '.'), API base (#28: errores código
estable que no filtran internals, cursores keyset, guard `exigir()` por permiso),
salud/listo (#29: baseViva() con tope, /listo≠/salud), telemetría (#30). Paquetes hoy:
@xhub/ui, @xhub/db, @xhub/core, @xhub/colas, @xhub/telemetry. Postgres+Redis locales
para tests: `docker run xhub-pg` (55432) y `xhub-redis` (56379). Todo probado contra
base/redis reales. Fase 1 ~75%: falta identidad de usuario (#22, necesita decidir IdP
con X5), admins de plataforma (#24), compose de despliegue (#31), respaldos (#32).

**Fase 2 en marcha (2026-09-24, con workflow ultracode):** diseñé+verifiqué adversarialmente la espina dorsal con un workflow de 11 agentes (guardado en workflows/scripts/xhub-fase2-*.js), luego implementé contra Postgres real. Mergeado: #34/#35 personas+identidades por canal ("el teléfono NO es la llave", asegurarPersonaPorIdentidad idempotente con advisory xact lock, normalización CL) y #37 interacciones (append-only, dedupe_id idempotente, orden por seq). Módulo en modulos/nucleo/src (clientes/normalizar/personas/interacciones). Patrón de tenant: FK COMPUESTA (cliente_id,id) además de la simple, revoke delete en personas (fusión es puntero).
**DOS BUGS DE FONDO corregidos, cazados por tests:**
1. conCliente() corría con el usuario superusuario del pool → un superusuario IGNORA la RLS aunque esté forzada, el aislamiento era mentira. FIX: conCliente hace `set local role xhub_app`. La app SIEMPRE debe conectar como xhub_app; migraciones usan el owner.
2. `select seq::text ... order by seq desc` → el alias de texto SOMBREA la columna bigint y pg ordena como TEXTO ("89" antes que "9"). FIX: alias de tabla `order by i.seq`. Aplica a cualquier order-by sobre una columna que también se castea a texto en el select.
Trampas de entorno: el scratchpad clone puede traer archivos untracked de intentos previos (0004_nucleo_espina.sql etc.) que colisionan por `create table if not exists` — verificar `git status` y borrarlos. fileParallelism:false en módulos que comparten la base de test (migrar() race al crear schema). `alter default privileges` NO cubre secuencias ya creadas en la misma migración — grant explícito sobre <tabla>_seq_seq. Postgres/Redis de test: xhub-pg (55432), xhub-redis (56379).
Falta de Fase 2: #36 enlaces+fusión, #39/#40 etiquetas+campos, #42/#43 búsqueda+ficha. El plan sintetizado completo está en el output del workflow (tasks/w0a6yjard.output).

**FASE 2 COMPLETA (2026-09-24):** espina dorsal entera implementada y probada contra Postgres real, siguiendo el plan del workflow. Mergeado #34/35 personas+identidades+normalización, #37 interacciones, #38/36 enlaces+fusión, #39/40 etiquetas+campos, #42/43 búsqueda+ficha360. Solo queda #41 (adjuntos S3, espera MinIO/R2). Módulo en modulos/nucleo/src (clientes/normalizar/personas/interacciones/enlaces/etiquetas/ficha). ~56 tests del módulo nucleo. TEST CORONA verde: con solo núcleo una persona tiene su historia y "encender xTickets" no migra nada (interacción objeto_tipo='ticket' sobre el mismo persona_id; las previas conservan seq/id sin UPDATE). Fusión: el trigger append-only de interacciones permite UPDATE solo si cambia únicamente persona_id. Búsqueda: unaccent OBLIGATORIO (el stemmer español es sensible a la tilde). Migraciones nucleo Fase 2: 0004 personas, 0005 interacciones, 0006 enlaces, 0007 etiquetas, 0008 busqueda. Extensiones (0000b): pgcrypto + unaccent.

**Dominios definitivos (Lino, 2026-09-25):** panel staging=stagexhub.voxtilabs.cl / prod=xhub.voxtilabs.cl; API por llave staging=api-stagexhub.voxtilabs.cl / prod=api-xhub.voxtilabs.cl. Por variable de entorno (XHUB_DOMINIO_PANEL/API, XHUB_CORS_ORIGENES), no horneados. La API va en dominio separado del panel por CORS/seguridad. Doc en docs/despliegue/DOMINIOS.md. Va tras Traefik/Dokploy sin puertos de host. Lino los va a pedir/crear.

**Fase 4 avanzada + SDK (2026-09-25):** mergeado #73 entitlements + #75 llaves de API (el cliente sale de la llave, hash sha256, cruzar clientes imposible), #76/#77 rate limit + cuota mensual (@xhub/cuotas sobre Redis, mes de negocio Chile, avisos 80/100 una vez con SETNX), #78 guard de API (autenticarApi: scope acotado por entitlement -> encender módulo habilita su scope en la petición siguiente SIN recrear la llave) + tablero de consumo, #71 panel superadmin (modelo de presentación puro + vista previa X5 en packages/ui/preview/superadmin.html), #81 SDK de módulos (@xhub/sdk-modulo: DefinicionModulo + validarDefinicion) + #82 módulo de referencia (modulos/ejemplo: guarda SU objeto pero persona+interacción van al núcleo; consumidor de persona.fusionada re-apunta). Paquetes ahora: ui, db, core, colas, telemetry, cuotas, sdk-modulo + módulos nucleo y ejemplo. ~120 tests. **El SDK probado => xTickets/xCRM ya se pueden desarrollar en el repo aparte voxtilabs/xhub-modulos (aún sin crear).** Previews navegables: superadmin.html, login.html, index.html. Total ~32 issues cerradas, ~32 PRs. Recordar: cada paquete/módulo que importa pg necesita pg + @types/pg en su package.json (typecheck estricto).

**Panel con shadcn/ui (2026-09-25):** Lino pidió usar componentes ya hechos (shadcn/ui, blocks.so) para no tener piezas bugeadas artesanales. Montado apps/panel = Next.js App Router con componentes shadcn (Radix, accesibles) tematizados con la paleta Consola X5 en variables CSS (naranja #ff7a1a=primary, cyan=senal, azul-abismo=background; modo claro/oscuro con data-tema). Pantallas: app/page.tsx (login) y app/superadmin/page.tsx. Componentes en apps/panel/components/ui (button/card/badge/input). **DECISIÓN: el `next build` corre en el DESPLIEGUE (imagen Docker), NO en el CI del monorepo** — el CI de la lógica no se acopla al toolchain de Next ni al lockfile de sus deps (scripts build/typecheck del panel son echo ok). Para dev: cd apps/panel && pnpm install && pnpm dev.
**INCIDENTE DE ENTORNO (2026-09-25):** hay OTRO proceso Claude en el mismo proyecto -home-lino que hace "startup cleanup" y BORRA archivos sin commitear del scratchpad (me borró apps/panel/app entero antes de commitear, y mutó pnpm 10→12.4.1 e instaló @openai/codex). Mitigación: escribir y COMMITEAR+PUSHEAR rápido en un solo script; lo mergeado en GitHub está siempre a salvo. No confiar en que el working tree del scratchpad sobreviva entre llamadas largas.

**Panel ampliado con blocks.so/shadcn (2026-09-25):** agregados Switch y Tabs (Radix) tematizados X5, y dos pantallas al estilo blocks.so: apps/panel/app/superadmin/cliente (toggles encender/apagar xTickets/xCRM + llave API + consumo) y apps/panel/app/persona (ficha 360 con tabs Historia/Identidades/Datos). blocks.so = composiciones sobre shadcn; ahora que la base está tematizada X5, cualquier bloque hereda la identidad.
**TRAMPA DE CI (lockfile):** agregar deps a un package.json del workspace (aunque el panel no se buildee en CI) ROMPE `pnpm install --frozen-lockfile` del ci.yml. FIX: regenerar el lockfile con el pnpm FIJADO `npx pnpm@10.0.0 install --lockfile-only` y commitear pnpm-lock.yaml. NO usar el pnpm 12 del entorno (formato distinto). Este es el paso obligatorio tras tocar cualquier package.json con deps nuevas.

**REGLA FIRME (Lino, 2026-09-26): xTickets y xCRM van en OTRO REPO = voxtilabs/xhub-modulos, NO en voxtilabs/XHub** (ADR 0009). El repo XHub = núcleo + espina dorsal + conector + panel + SDK. Los módulos de negocio (tickets, crm) consumen el SDK desde el repo aparte. Se construyó xTickets temporalmente en XHub por velocidad de demo; MOVERLO a xhub-modulos. Un módulo NO debe importar @xhub/modulo-nucleo directo: usa la NucleoApi del SDK (asegurarPersona, registrarInteraccion) que se le inyecta. Deps de un módulo: solo @xhub/sdk-modulo + @xhub/core + pg.

**Avances 2026-09-26:** Conector XContact ACL sin túnel mergeado (#177): puerto ProveedorContactCenter, mapeo.ts (traductor único: estados de llamada, fecha Chile→ISO, E.164, envoltorio {dados,total}), resiliencia (cortacircuitos, balde de fichas, taxonomía de errores). Motor de reglas #85, webhooks salientes #91, panel con shadcn+blocks.so (login/superadmin/cliente/persona/webhooks/auditoría). **DEMO NAVEGABLE publicada como Artifact** (Consola X5, sala de control nocturna): https://claude.ai/code/artifact/3af5c008-c641-4372-a912-92f89e000cbf — para presentar sin accesos de X5. X5 NO dará accesos esta semana; la demo es la prioridad.

**xTickets PROFESIONAL (2026-09-26, voxtilabs/xhub-modulos):** llevado a estándar Zendesk. Backend (src/tickets/): jerarquía agente<supervisor<admin con matriz de permisos por rol (roles.ts), equipos con enrutamiento/escalado, SLA por prioridad con HORARIO HÁBIL real (sla.ts sumarMinutosHabiles L-V 9-18 Chile), primera respuesta marca hito, CSAT 1..5 solo resueltos, bandeja por visibilidad de jerarquía. 16 tests. Migraciones 0001+0002. Panel (panel/): Next+shadcn Consola X5 con bandeja (filtros, SLA, sin-asignar) y detalle (conversación público+notas internas, macros, panel lateral 360 SLA/asignación/ficha). Dominios reservados: tickets-stagexhub.voxtilabs.cl / tickets-xhub.voxtilabs.cl (docs/DOMINIOS.md). Bug pg: PK con expresión coalesce no existe → índice único funcional. El contrato SDK está sincronizado a mano en sdk/ (stopgap hasta publicar a registro). El next build del panel corre en despliegue, no en CI.

**DECISIÓN REVERTIDA (Lino, 2026-09-26): xTickets VUELVE al monorepo voxtilabs/XHub** (modulos/tickets). Tras discutir el tradeoff, para un equipo chico el monorepo es mejor: sin sincronizar el SDK a mano, cambios atómicos, un solo CI. La FRONTERA LIMPIA se mantiene: el módulo usa la NucleoApi del SDK inyectada (no importa @xhub/modulo-nucleo directo); test/nucleo-real.ts adapta el núcleo real a NucleoApi → integración de verdad. voxtilabs/xhub-modulos quedó SUPERADO/archivado. Migraciones tickets: 0013/0014. Panel de tickets en apps/panel/app/tickets (bandeja+detalle). El SDK separado sigue existiendo (packages/sdk-modulo) por si algún módulo se separa a futuro — barato de mover gracias a la NucleoApi. Ley del CI ajustada: excluye roles.ts (traductor de tickets) y apps/panel del grep 'rol==='.

**RESPALDO DE MEMORIA (Lino, 2026-09-26):** la memoria del proyecto está respaldada en el repo en `docs/memoria/xhub-x5-voxtilabs.md` (PR #182). Mantenerla sincronizada: cuando cambie algo importante, actualizar tanto esta memoria como el archivo del repo. Es el respaldo "por si acaso" que pidió Lino.
**xTickets reportes (2026-09-26):** modulos/tickets/reportes.ts con metricas() de supervisor (abiertos, sin asignar, SLA incumplidos, resueltos hoy, CSAT, mediana primera respuesta) y rendimientoAgentes(); jerarquia respetada (agente no ve reportes). Demo Artifact ACTUALIZADO con pantallas de xTickets (bandeja+detalle con SLA y panel 360). Total: XHub ~35 PRs, tickets integrado en monorepo con nucleo real.

**xTickets FUNCIONALIDADES ÚNICAS (2026-09-26):** lo que diferencia de Zendesk, aprovechando la espina dorsal. modulos/tickets/: automatizacion.ts (auto-asignación round-robin ticket_rr, colisión de edición ticket_presencia verTicket/otrosViendo, disparadores auto-asignar+acuse), contexto.ts (contextoOmnicanal=historia completa de la persona por TODOS los canales dentro del ticket, reincidencia=cliente que reclama repetido ≥3/30d, ticketsRelacionados+fusionarTickets=deduplicar misma persona), urgencia.ts (detección enojo/legal-SERNAC/urgencia/positivo es-CL MISMA interfaz que un LLM → IA-ready; ticket enojado+legal escala solo a urgente; SLA que PAUSA en 'pendiente' esperando cliente, slaConsumidoSeg resta pausas). Migraciones 0015/0016/0017. ~40 tests del módulo tickets. Guía blocks.so en docs/diseno/BLOCKS-SO.md. TOTAL XHub ~40 PRs mergeados. Regla: al agregar features de tickets, tests con nucleoReal (test/nucleo-real.ts), no stub.

**API HTTP REAL (2026-09-26) — el salto a producción:** apps/api con Fastify = el servidor que un cliente llama de verdad. Guard por llave (Bearer xhub_) → autenticarApi, rate limit + cuota (cabeceras x-cuota-restante/x-ratelimit-remaining), errores código estable + x-request-id, cabeceras de seguridad por la app, /salud + /listo, rutas /v1 conCliente (RLS). Rutas: POST/GET /v1/tickets, /tickets/:id/estado|asignar|contexto (360 omnicanal), /personas/:id/ficha, /personas?q=. apps/api/src/nucleo.ts compone el núcleo real como NucleoApi (aquí se enchufan los módulos). 6 tests de integración HTTP real (fastify.inject) contra PG+Redis. El Dockerfile ya arranca este proceso con XHUB_PROCESO=api → apps/api/dist/main.js (se compila en despliegue). Deps: fastify. Total XHub ~41 PRs.

**IA con GLM 5.3 (2026-09-26):** Lino compartió una API key de NVIDIA NIM (nvapi-..., ¡ROTAR! viajó por chat). GLM 5.3 disponible como z-ai/glm-5.3 y z-ai/glm-5.3-flash en https://integrate.api.nvidia.com/v1 (compatible OpenAI). OJO: GLM 5.3 es modelo de RAZONAMIENTO — el content final llega tras reasoning_content, necesita max_tokens alto (1200+) y tope de tiempo ~55s; flash es más rápido. Construido @xhub/ia: adaptador env-gated (sin IA_API_KEY → apagado, fallback determinista; con key → GLM). Config por env: IA_API_KEY (por referencia, NUNCA en repo), IA_API_BASE, IA_MODELO. xTickets resumirConversacion() ahora IA-first con fallback. Tests: env-gated en CI + contacto real test.skip sin key. La misma interfaz sirve para la detección de urgencia (hoy determinista, IA-ready). PR #191. Total XHub ~44 PRs.
**API server (validacion Zod #190):** apps/api con Zod .strict() por ruta; cazó bug estado-cliente vs estado-ticket. Librerias estandar usadas: Fastify, Zod, shadcn/Radix, BullMQ, pg, ioredis, zod. Regla de Lino: NO reinventar la rueda, usar componentes/librerias de internet.
