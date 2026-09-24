# ADR 0008 — La versión de API de xContact se fija por instancia

**Estado:** aceptada · 2026-09-20 · **su regla de credenciales queda corregida por la ADR 0011**

## Contexto
En la instancia conocida, `xcontact-server` 3.9.14 sirve v2/v3/v4 en `:8004`
(nginx TLS → `127.0.0.1:8001`) y `xcontact-server-4` 4.3.0 escucha en `:8011`
(→ `127.0.0.1:8010`). El Swagger publicado tiene 461 rutas y 637 operaciones
entre versiones; **v4 son 209 operaciones en 165 rutas y 31 módulos**.
`/swagger.json` en 8010 devuelve **404**: el servicio nuevo no publica contrato.

## Decisión
`instancias_xcontact.version_api` es configuración. El conector tiene una
implementación del traductor por generación soportada. Se adopta **v4** como base.

Regla: **la versión más vieja que cumpla y esté estable.** Con cuatro generaciones
vivas, la más nueva suele ser la menos probada.

## Sobre el servicio de `:8011`
No se adopta hasta que exista contrato publicado o documentación entregada por X5.
Se investiga en un spike, no se asume.
