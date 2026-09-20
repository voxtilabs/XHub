# ADR 0001 — xHub es el sistema de registro; xContact es fuente de datos

**Estado:** aceptada · 2026-09-20

## Contexto
xContact es de X5 Soluciones. No lo construimos, no lo controlamos, su API tiene
cuatro generaciones vivas y falla. Sobre él debemos montar módulos propios.

## Decisión
xHub tiene su propia base y guarda una **copia canónica** de lo que necesita de
xContact. Ninguna pantalla ni reporte depende de que la API ajena responda en ese
instante.

## Consecuencias
- Hay que sincronizar y reconciliar: es trabajo real y permanente.
- El producto sobrevive a caídas del proveedor, degradado y diciéndolo.
- La verdad de negocio es nuestra; la de telefonía sigue siendo de xContact.
