# Arranque — `docker compose up` en una VPS limpia

La migrabilidad es criterio de arquitectura (ADR 0007), no una promesa: el sistema
levanta con `docker compose` y nada propietario en el camino. Esto está **verificado
de punta a punta**, no supuesto.

## Un artefacto, varios procesos

Una sola imagen (`Dockerfile`) con varios puntos de entrada; `XHUB_PROCESO` elige cuál
(ADR 0002). Corre TypeScript directo con **tsx** — sin paso de build que se rompa entre
una VPS y otra. Procesos:

| `XHUB_PROCESO` | Qué hace |
|---|---|
| `migrate` | Aplica las migraciones pendientes (orden topológico, idempotente) y sale |
| `api`     | Sirve la API Fastify en `:3000` (`/salud`, `/listo`, `/v1/*`, `/docs`) |
| `workers` | Aún sin app propia (los consumidores se despachan a mano por ahora): inerte |
| `panel`   | App Next (build en la imagen); `next start` en `:3000` — bandeja, kanban, alta de ticket, ficha 360, superadmin |

## Levantar

```sh
cp .env.example .env            # completa POSTGRES_PASSWORD (mínimo)
docker compose up -d --build api  # construye la imagen local y arrastra postgres, redis y migrate
```

La imagen se **construye en la propia máquina** desde el `Dockerfile` (un solo build
reutilizado por los 4 procesos vía el ancla `x-xhub`). En Dokploy es igual: clona el
repo y hace `docker compose up --build` en la VPS — **no se baja de ningún registro**,
así que no cuesta minutos de CI ni un pull de ~1 GB por la red.

Orden garantizado por `depends_on`: **postgres (healthy) → migrate (completa) → api**.
Las migraciones corren una sola vez, antes de que el api acepte tráfico.

## Verificación (lo que se comprobó)

```
migrate → aplicadas 22: 0000_plataforma_base … 0019_tickets_triage   (orden por dependencia)
api     → [xhub-api] escuchando en :3000
GET /salud → 200 {"ok":true}          # ¿vivo?
GET /listo → 200 {"listo":true}       # ¿Postgres responde?
```

Y el invariante de seguridad, comprobado en la base ya migrada (ley de la casa 1):

```
xhub      super=true    # el dueño migra
xhub_app  super=false   # la app corre sin superusuario → la RLS SÍ se evalúa
```

## Por qué esto es migrable

- **Sin servicios gestionados**: Postgres y Redis son contenedores; un `pg_dump`/restore
  + este compose reconstruyen el sistema en cualquier VPS.
- **Sin puertos del host**: el tráfico entra por el proxy inverso (Traefik/Dokploy); el
  compose no publica `ports` en producción. Dokploy es el *operador*, no una dependencia
  del código.
- **Todo por entorno**: nada horneado en la imagen; los dominios y secretos viven en el
  `.env` (secretos por referencia, ADR 0011). Cambiar de VPS es mover el `.env` y el
  volcado de Postgres, no un proyecto.
- **Sin paso de build frágil**: el runtime ejecuta el `src` con tsx; no hay artefactos
  compilados que difieran entre máquinas.

## Panel — verificado

`XHUB_PROCESO=panel` levanta el Next real (build en la imagen, `next start`):

```
✓ Ready in ~0.5s
GET /            → 200
GET /tickets     → 200   (bandeja + tablero kanban)
GET /tickets/nuevo → 200 (alta manual)
GET /superadmin  → 200
```

Enruta desde `xhub.voxtilabs.cl` / `tickets-xhub.voxtilabs.cl` por el proxy.

## Pendiente

- `workers` queda inerte hasta que exista una app que despache el outbox (hoy los
  consumidores se llaman a mano).
- Ensayo de migración cronometrado en VPS limpia como criterio de salida de Fase 8
  (→ `RESULTADOS-DR.md`), y subir el TTL de DNS cuando el borde se estabilice.
