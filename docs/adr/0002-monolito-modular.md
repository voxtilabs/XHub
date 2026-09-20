# ADR 0002 — Monolito modular con registro de módulos, no microservicios

**Estado:** aceptada · 2026-09-20

## Contexto
Equipo chico. Los módulos comparten la espina dorsal de datos y deben encenderse
por cliente.

## Decisión
Una aplicación modular con registro de módulos, desplegada como una imagen con
varios puntos de entrada (api, workers, paneles). Cada módulo declara manifiesto,
permisos, eventos y migraciones. Colisiones y ciclos abortan el arranque.

## Alternativas descartadas
- **Microservicios:** latencia, consistencia eventual y triple operación sin
  beneficio al tamaño actual.
- **App única sin módulos:** no permite vender ni aislar módulos por cliente.

## Consecuencias
Se puede extraer un módulo a su propio servicio más adelante porque los límites
se hacen cumplir con esquemas y contratos (ADR 0003, ADR 0005).
