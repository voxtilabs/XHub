# ADR 0011 — Bóveda de credenciales: sobre cifrado, no nombre de variable

**Estado:** aceptada · 2026-09-20 · **corrige la ADR 0008**

## Contexto

XContact es single-tenant: una instalación por cliente. xHub guarda, para cada
cliente, cómo hablarle a **su** instalación. Con N clientes, xHub concentra las
credenciales de acceso al centro de contacto de N empresas distintas.

La ADR 0008 dijo «credenciales por referencia: nombre de variable de entorno,
nunca el secreto en la base». Esa regla es correcta para tres instancias
configuradas a mano. **Es inviable para una flota que se da de alta desde el
panel**: el asistente de alta (#137) no puede crear variables de entorno ni
redesplegar el sistema cada vez que entra un cliente.

Mantener la regla obligaría a que cada alta pase por infraestructura, que es
exactamente el techo de crecimiento que queremos evitar (§18.2).

## Decisión

**Cifrado en sobre.** El secreto de cada instancia se guarda cifrado en la base
con una clave de datos propia; esa clave viaja cifrada con una **clave maestra que
vive solo en el entorno** y nunca en la base.

Reglas que no se negocian:

1. La clave maestra se inyecta por entorno y **no se guarda en ninguna parte del
   repositorio ni de la base**. Es lo único que sigue siendo "por referencia".
2. Un secreto se descifra **solo** en el momento de usarlo, en el conector, y
   nunca se devuelve por la API — ni siquiera enmascarado a un superadmin.
3. El descifrado queda auditado: qué instancia, cuándo y por qué operación.
4. Rotación posible sin migración de datos: recifrar las claves de datos con la
   maestra nueva, sin tocar los secretos.
5. Ningún secreto en registros, trazas ni mensajes de error. Un test lo verifica.

## Consecuencias

- Dar de alta un cliente pasa a ser un formulario, no un despliegue.
- **xHub se convierte en la bóveda de acceso a los centros de contacto de N
  empresas.** Eso eleva su clasificación de riesgo: perder la base sin la clave
  maestra no expone nada, pero perder ambas expone a todos los clientes de X5 a la
  vez. De ahí que la clave maestra jamás acompañe a los respaldos.
- Los respaldos de Postgres salen cifrados y **sin** la clave maestra, que se
  custodia aparte. Un restore necesita las dos cosas, a propósito.
- Si más adelante X5 aporta un gestor de secretos, la interfaz ya está: se cambia
  la implementación de la bóveda y nada más.

## Alternativa descartada

Un gestor de secretos externo desde el día uno. Es mejor a la larga, pero añade
una pieza de infraestructura propietaria al camino crítico y choca con la
portabilidad de la ADR 0007. La interfaz queda preparada para adoptarlo sin
reescribir nada.
