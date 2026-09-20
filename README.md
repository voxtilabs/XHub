# xHub

Plataforma central de X5 Soluciones. Construida por VoxTi Labs.

xHub es **el sistema de registro**: donde se crean los clientes, se les encienden
módulos, se les entrega su propia API con límites de uso, y donde vive junta toda
la información de todos los módulos.

XContact —la plataforma de contactabilidad omnicanal de X5— es **una fuente de
datos, no la base de datos**. Sigue siendo el producto de atención; el agente no
se muda a xHub.

## Leer primero

1. [Arquitectura completa](docs/ARQUITECTURA.md) — la decisión de fondo, la espina dorsal, el conector, el plan por fases.
2. [Inventario de la API de xContact](docs/xcontact/INVENTARIO.md) — 209 operaciones v4 y lo que de verdad está verificado.
3. [Decisiones de arquitectura](docs/adr/) — 10 ADRs; no se rediscuten sin derogarlas.
4. [Cómo trabajamos](CONTRIBUTING.md) — ramas, PRs, criterio de salida.

## Las tres ideas que sostienen todo

**Una sola persona, una sola historia.** Personas, identidades por canal,
interacciones y enlaces viven en el núcleo. Ningún módulo guarda contactos por su
cuenta. Por eso un cliente puede tener solo xTickets y encender xCRM más tarde
**sin migrar nada**: la historia ya está ahí.

**Un solo módulo habla el idioma ajeno.** El conector traduce el vocabulario de
xContact —portugués, cuatro generaciones de API, bugs conocidos— y nadie más lo
ve. Si su API cambia, se toca un módulo.

**Degradar, no caer.** Si xContact no responde, xHub sigue sirviendo su copia
canónica y lo dice en pantalla. "No sé" es un estado propio, distinto de
"está bien".

## Alcance de este repositorio

Núcleo · espina dorsal · **conector xContact** · panel superadmin · API por
cliente · SDK de módulos.

xTickets y xCRM viven en `voxtilabs/xhub-modulos` y consumen el SDK. La separación
es de repositorio, no de arquitectura: una sola base de datos (ADR 0009).

## Estado

Fase 0. El repositorio arranca con la arquitectura, las decisiones y el backlog
completo. El código empieza en Fase 1.
