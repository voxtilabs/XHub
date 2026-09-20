# ADR 0004 — Capa anticorrupción: un solo módulo habla el vocabulario de xContact

**Estado:** aceptada · 2026-09-20

## Contexto
La API de xContact está en portugués, tiene 209 operaciones solo en v4, cuatro
generaciones conviviendo, y bugs conocidos.

## Decisión
Un módulo conector con un puerto (`ProveedorContactCenter`). Todo el vocabulario
ajeno —nombres, enums, fechas, paginación, errores— se traduce en un único lugar
con un test por campo. Nada fuera del conector sabe que existe el portugués.

## Consecuencias
Un cambio de la API ajena toca un módulo, no el producto. Sustituir xContact algún
día es reemplazar una implementación del puerto.
