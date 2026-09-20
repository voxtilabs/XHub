# ADR 0010 — TLS hacia xContact: verificar contra su certificado, no desactivar

**Estado:** aceptada · 2026-09-20

## Contexto
El descubrimiento registró que el certificado servido por `:8004` está **vencido**
y su SAN corresponde a un nombre DNS, no a la IP con la que se le habla. La salida
fácil es `rejectUnauthorized: false`.

## Decisión
Prohibido desactivar la verificación TLS de forma general. Se usa, en este orden:
1. Hablarle por el **nombre DNS del certificado**, resolviéndolo en el contenedor
   del conector (alias de host), o
2. **Fijación del certificado** del proveedor por huella, cargado como confianza
   explícita de ese cliente HTTP y solo de ese.

La excepción por certificado vencido se anota por instancia, con fecha, y aparece
en el tablero de salud como degradación hasta que X5 lo renueve.

## Consecuencias
Se pide a X5 la renovación del certificado y el nombre correcto. Mientras tanto,
la excepción es explícita, acotada al conector y visible, no un flag escondido.
