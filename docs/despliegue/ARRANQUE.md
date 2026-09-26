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
| `panel`   | Aún no cableado como app Next ejecutable: inerte |

## Levantar

```sh
cp .env.example .env            # completa POSTGRES_PASSWORD (mínimo)
export XHUB_IMAGE=xhub:local
docker build -t "$XHUB_IMAGE" .
docker compose up -d api        # arrastra postgres, redis y migrate por depends_on
```

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

## Pendiente

- `panel` y `workers` quedan inertes hasta cablearlos (el panel necesita declarar
  `next`/`react` y su `server.js`; los workers, una app que despache el outbox).
- Ensayo de migración cronometrado en VPS limpia como criterio de salida de Fase 8
  (→ `RESULTADOS-DR.md`), y subir el TTL de DNS cuando el borde se estabilice.
