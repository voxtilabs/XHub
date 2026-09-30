# Alcance remoto revisado antes de publicar Horizon

Revisión de sólo lectura del 30 de septiembre de 2026. Repositorio: `voxtilabs/XHub`.

La rama funcional activa es **`feat/tickets-reales`**, PR [#231](https://github.com/voxtilabs/XHub/pull/231), abierta en el SHA `03a0dbc963c94bae308c3b825069060fe1b6cd3c`. Contiene 51 commits sobre `main` (`035f1535c0ae160a79251dc78af573e95f9df9ab`), que es su ancestro. Las últimas incorporaciones son el aviso de datos espejados de Persona y los contactos de la persona en el detalle del ticket.

## Las nueve ramas remotas

| Rama | SHA revisado | Situación frente a la base funcional |
|---|---|---|
| `main` | `035f1535c0ae160a79251dc78af573e95f9df9ab` | Incluida como ancestro de PR #231. |
| `feat/tickets-reales` | `03a0dbc963c94bae308c3b825069060fe1b6cd3c` | Base funcional activa elegida para el rediseño. |
| `feat/rbac-self-service` | `fc8947cd9857cb59e9934d12aadfb7fe2020a65e` | Parche equivalente ya integrado por #224; `git cherry` lo reconoce como incluido. |
| `feat/roles-plataforma-cliente` | `6d6586a56071ade29f11ed2735acaf82304a473e` | Parche equivalente ya integrado por #222. |
| `feat/tope-usuarios-cliente` | `51e78f73777f8d981ec143ca2647f2294555c257` | Parche equivalente ya integrado por #223. |
| `feat/observabilidad-ia` | `0cef3d3603000e1c68c03e90a13713bd04e64209` | Sus dos commits se integraron mediante squash #225. El árbol es idéntico al merge `a03d9ea`, incluido en la base. |
| `docs/mem3` | `e68a3bb0b6421a39b11f46b58fde0b87868294f6` | PR #195 abierto: sólo cambia `docs/memoria/xhub-x5-voxtilabs.md`. No añade una interfaz ni funcionalidad operativa. No se mezcló automáticamente. |
| `feat/diseno-horizon` | `2b5f88cf576627ec2ab9e5e326b1d984b1337e92` | Diseño anterior basado en main; árbol idéntico a `style/xhub-horizon-ui`. Sus recursos se adaptaron al panel real, sin reintroducir la demo. |
| `style/xhub-horizon-ui` | `3f1092fc6bb86d4c300f0f9a236347a7d28b6f2d` | Diseño anterior de PR #232; conserva `/tickets/detalle` estático, reemplazado intencionalmente por `/tickets/[id]` en PR #231. |

La búsqueda de PRs abiertos devuelve únicamente #231 y [#195](https://github.com/voxtilabs/XHub/pull/195). No se identificó otra rama funcional activa con pantallas nuevas ausentes de #231. Esto describe `voxtilabs/XHub`, no todos los repositorios de la organización. `xhub-modulos` se verificó previamente como privado y archivado; la memoria del monorepo documenta el regreso de xTickets.

## CI y despliegue

- [CI de 03a0dbc, run 36668021687](https://github.com/voxtilabs/XHub/actions/runs/36668021687) falla en «Leyes de la casa», antes de instalar dependencias o ejecutar build/pruebas. El log identifica comparaciones de rol preexistentes en `apps/api/src/rutas/cliente.ts:111,115,130` y `apps/api/src/rutas/consola.ts:36,40`.
- [Seguridad de 03a0dbc, run 36668021727](https://github.com/voxtilabs/XHub/actions/runs/36668021727) terminó correctamente.
- El workflow `ci` corre en PRs. El workflow `build` sólo se dispara manualmente; `deploy-staging` depende de `build` sobre main o de un despacho manual. Crear un PR hacia `feat/tickets-reales` no solicita ninguno de esos despliegues. No se inspeccionó configuración externa de Dokploy ni se garantiza el SHA servido por staging.
- El PR Horizon debe apuntar a `feat/tickets-reales`. No corresponde incorporar automáticamente las ramas antiguas ni fusionar contra main para aparentar un alcance mayor.

La disponibilidad para revisión en borrador no equivale a aprobación de integración. La API real, persistencia e integraciones externas siguen fuera de las pruebas con fixture local.
