# ADR 0005 — Personas e interacciones viven en el núcleo, nunca en un módulo

**Estado:** aceptada · 2026-09-20

## Contexto
El requisito central: un cliente puede tener solo xTickets y, más adelante,
encender xCRM **sin migrar nada** y ver toda la historia previa.

## Decisión
`personas`, `identidades`, `interacciones` y `enlaces` viven en el esquema del
núcleo. Ningún módulo guarda contactos por su cuenta. Los módulos sí son dueños
de sus objetos: el ticket es de xTickets, la oportunidad es de xCRM.

## Consecuencias
- Encender un módulo es un interruptor, no una migración de datos.
- El teléfono **no** es la llave: la llave es la identidad del canal de origen.
- Orden de la línea de tiempo por `seq bigserial`, nunca por `created_at`:
  en Postgres `now()` es fijo dentro de la transacción y las filas empatan.
