# Sistema de diseño de xHub — "Consola X5"

Derivado de la identidad de **x5s.cl** (la "Sala de Control Nocturna" de XContact).
xHub es el panel de control central de X5; debe **verse como X5**, no genérico.

## Principio

Un centro de operaciones. Fondo azul-abismo casi negro donde lo vivo se lee como
señal de luz. Dos acentos con **roles estrictos**:

- **Naranja Señal `#ff7a1a` = LA ACCIÓN.** Un botón primario, un foco, un punto de
  estado. Nunca fondo de sección ni decoración. Su escasez lo hace legible.
- **Cyan Radar `#75d8ee` = LA SEÑAL.** Actividad, etiquetas, líneas de sistema.
  **Nunca es un botón.** Sobre fondo claro cede a Teal Consola `#0e6f86`.

Tipografía **Inter**, titulares de tracking negativo, micro-etiquetas mayúsculas
font-black con tracking `0.1em`. Paneles de vidrio (blanco 6%, borde blanco 10%,
esquinas 2rem) sobre lo oscuro.

## Tokens (fuente única: `packages/ui/src/tokens.css`)

| Rol | Token | Valor |
|---|---|---|
| Acción | `--accion` | `#ff7a1a` |
| Señal | `--senal` | `#75d8ee` |
| Señal en claro | `--senal-claro` | `#0e6f86` |
| Éxito/flujo | `--exito` | `#34d399` |
| Fondo base | `--fondo` | `#05070a` |
| Superficie | `--superficie` | `#0a1118` |
| Vidrio | `--vidrio` | `rgba(255,255,255,0.06)` |
| Borde vidrio | `--borde` | `rgba(255,255,255,0.10)` |
| Texto | `--texto` | `#ffffff` |
| Texto sobre acción | `--texto-accion` | `#020617` |

## Reglas de la casa (visuales)

1. **Un solo naranja.** Si hay dos naranjas en pantalla compitiendo por ser "la
   acción", uno está mal.
2. **El cyan no se clickea.** Marca estado, no invita a pulsar.
3. **Sin hex sueltos.** Todo color sale de un token. Un test del CI recorre el
   código y falla ante cualquier hex fuera de `tokens.css` (misma ley que en IAxTi).
4. **Modo claro y oscuro** desde el día uno: el oscuro es el hogar; el claro es
   "encender la luz para revisar detalles".
