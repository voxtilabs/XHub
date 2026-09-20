# ADR 0009 — Dos repositorios, una sola base de datos

**Estado:** aceptada · 2026-09-20

## Contexto
Decisión de Lino: concentrar el esfuerzo de este repo en xHub y en la API
sanitizada. xTickets y xCRM van a `voxtilabs/xhub-modulos`.

## Decisión
La separación es de repositorio, no de arquitectura. xHub publica
`@xhub/sdk-modulo`, `@xhub/contratos-nucleo` y `@xhub/ui` versionados; el otro
repo los consume y la imagen de xHub compone los módulos en tiempo de build.

Dos repos, dos equipos, dos ritmos — **un despliegue, una base, una persona.**

## Consecuencias
- SemVer estricto y ventana de compatibilidad de dos mayores.
- Un módulo de referencia en este repo prueba el SDK antes de que el otro equipo
  lo sufra.
- Los módulos siguen sin base propia (ADR 0005).
