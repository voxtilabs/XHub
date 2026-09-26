# Usar bloques de blocks.so en xHub

blocks.so es una galería de **bloques** (pantallas y secciones ya compuestas) hechos
sobre **shadcn/ui** — la misma base que usa el panel de xHub. Por eso un bloque de
blocks.so se integra casi sin retoques y **hereda la identidad Consola X5**.

## Cómo integrar un bloque

1. **Mira el bloque** en https://blocks.so y copia su código (botón "Copy" o "Code").
2. **Instala los componentes shadcn** que use (los verás en sus imports, `@/components/ui/*`):
   ```bash
   cd apps/panel
   npx shadcn@latest add table dropdown-menu avatar   # los que falten
   ```
   Los que ya tenemos: `button`, `card`, `badge`, `input`, `switch`, `tabs`, `table`.
3. **Pega el bloque** como una página o componente en `apps/panel/app/...`.
4. **Hereda el tema solo:** nuestros tokens (Consola X5) están en
   `apps/panel/app/globals.css` mapeados a la convención shadcn (`--primary` = naranja
   acción, `--senal` = cyan, `--background` = azul-abismo). Un bloque estándar sale con
   nuestra identidad sin tocar colores.

## Reglas de la casa que un bloque debe respetar

- **Un solo naranja**: el naranja (`--primary`) es LA acción. Si el bloque lo usa de
  decoración, cámbialo a `--senal` o a un neutro.
- **El cyan no se clickea**: `--senal` marca estado/actividad, nunca es un botón.
- **Sin hex sueltos**: usa las variables (`hsl(var(--...))`), no hex directos. El color
  del estado va por rol (`Badge rol="exito|senal|accion|aviso|critico|neutro"`).
- **Color semántico separado del acento**: `exito/aviso/critico` para estados; el
  naranja es solo acción.

## Qué ya está construido con estos patrones

- `app/tickets/page.tsx` — bandeja con filtros y SLA (patrón "data table with filters").
- `app/tickets/detalle/page.tsx` — detalle con panel lateral 360 (patrón "detail + aside").
- `app/superadmin/*` — dashboard, detalle de cliente (patrón "settings"), auditoría.
- `app/persona/page.tsx` — ficha con tabs (patrón "profile with tabs").

Estos se escribieron a mano sobre shadcn siguiendo los patrones de blocks.so; se
pueden reemplazar por el bloque oficial cuando se quiera, y el tema se mantiene.
