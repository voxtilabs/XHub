# Cómo trabajamos

## Ramas y PRs

- `main` está protegida: sin empuje directo, PR obligatorio, check `ci` en verde
  del **último** commit y una aprobación.
- Una rama por issue: `<tipo>/<n>-<resumen>` → `feat/42-conector-contactos`,
  `fix/77-paginacion-cursor`, `spike/12-v5-sin-swagger`.
- **Siempre desde `main` recién actualizada.** Una rama apilada sobre commits ya
  fusionados con squash deja el CI sin disparar y el PR no se puede validar. Si
  pasa: rama nueva desde `origin/main` y traer los archivos.
- Antes de retomar trabajo: `git branch --show-current`. Un commit en la rama
  equivocada cuesta más de rescatar que de prevenir.

## Tomar una issue

1. Revisa que no diga `status:blocked`; si lo dice, lee de qué depende.
2. Asígnatela. Si dos personas pueden avanzar en paralelo, las issues lo declaran.
3. Al abrir el PR: `Cierra #n` en el cuerpo.

## Criterio de salida

Toda issue trae un criterio **verificable desde afuera**. No se cierra con "el
código está mergeado": se cierra mostrando el comportamiento. Un `curl`, una
consulta, una captura del tablero.

## Las leyes de la casa

El CI las verifica. Cada una está escrita porque su ausencia ya costó caro:

1. El rol de aplicación **no** es superusuario — con RLS activo y rol superusuario
   las políticas ni se evalúan, y los tests mienten.
2. Ningún `rol === '...'` fuera del traductor de roles.
3. El día es el del negocio (`America/Santiago`) y viaja como texto `AAAA-MM-DD`.
4. Orden de eventos por `seq`, jamás por `created_at`.
5. Los tests corren contra una base real; un paso verifica que la suite escribió
   filas. Una suite sin base pasa en verde tapando bugs.
6. Idempotencia en todo consumidor y todo webhook entrante.
7. Nunca HTTP dentro de una transacción: se encola.
8. Auditoría append-only, con trigger anti UPDATE/DELETE.
9. Migraciones aditivas.
10. Secretos por referencia, jamás el valor en la base.

## Trabajar con la API de xContact

- **No hace falta el túnel para desarrollar.** Las fixtures grabadas cubren el
  desarrollo y el CI. El túnel solo es necesario para grabar fixtures nuevas y
  para la suite de contacto real.
- Todo lo que toque su vocabulario va **dentro del conector**. Si necesitas un
  campo suyo fuera del conector, falta traducirlo.
- Su API tiene bugs. Cuando encuentres uno: documéntalo en
  `docs/xcontact/TRAMPAS.md` con la evidencia, y abre issue con `module:conector`.
