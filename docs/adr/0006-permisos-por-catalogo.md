# ADR 0006 — Permisos por catálogo; el rol nunca decide

**Estado:** aceptada · 2026-09-20

## Decisión
Ninguna línea de código pregunta `rol === '...'`. Cada módulo declara sus permisos
en su manifiesto; un único traductor convierte rol + entitlements en permisos.

## Verificación
Grep bloqueante en CI sobre `rol ===` / `role ===` fuera del traductor.

## Consecuencias
Apagar un módulo a un cliente retira sus permisos en la petición siguiente, sin
tocar usuarios ni roles.
