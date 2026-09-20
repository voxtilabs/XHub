# ADR 0003 — Una base Postgres con RLS forzada, rol de aplicación no superusuario

**Estado:** aceptada · 2026-09-20

## Decisión
Una base, `tenant_id` en toda tabla de negocio, `FORCE ROW LEVEL SECURITY`, y un
rol de aplicación **sin** `SUPERUSER` ni `BYPASSRLS`. Un esquema por módulo, y el
rol sin `GRANT` sobre las tablas de otros módulos.

## Por qué importa
Con un rol superusuario Postgres **ni evalúa** las políticas: los tests pasan y
la protección no existe. Ya costó caro antes.

## Verificación
Test que lee datos de otro cliente y recibe cero filas, **y** el mismo test contra
un rol superusuario que debe fallar — así se prueba que la prueba sirve.
