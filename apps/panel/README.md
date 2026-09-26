# @xhub/panel

Panel de xHub en Next.js (App Router) con **shadcn/ui** tematizado con la identidad
Consola X5 (ver `docs/diseno/SISTEMA.md`). Componentes de Radix, accesibles y probados
— no piezas hechas a mano.

## Correr en desarrollo
```
cd apps/panel && pnpm install && pnpm dev
```
El `build` de producción (`next build`) corre en el despliegue, no en el CI del
monorepo, para no acoplar el CI de la lógica al toolchain de Next. La verificación de
tipos de la app se hace con su propio `tsc` al construir la imagen.

## Estructura
- `app/page.tsx` — ingreso
- `app/superadmin/page.tsx` — panel superadmin (clientes, módulos, consumo)
- `components/ui/*` — componentes shadcn tematizados X5 (button, card, badge, input)
- `app/globals.css` — paleta X5 en variables CSS (convención shadcn)
