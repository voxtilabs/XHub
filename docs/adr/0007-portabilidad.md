# ADR 0007 — Portabilidad: contenedores y Postgres propio, sin servicios gestionados

**Estado:** aceptada · 2026-09-20

## Contexto
Se despliega en infraestructura de X5, hoy una VPS con Dokploy prestada, y debe
poder migrarse a otra sin que sea un proyecto.

## Decisión
Postgres, Redis y almacenamiento S3-compatible propios, en contenedores. Dokploy
es el operador, no una dependencia del código: el artefacto es un
`docker-compose.yml` que levanta igual a mano. Nada horneado en el build.

## Verificación
Restaurar respaldo en una VPS limpia, levantar con compose, cronometrar y anotar
el resultado. Se repite cada trimestre.
