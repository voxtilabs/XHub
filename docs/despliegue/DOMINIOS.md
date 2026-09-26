# Dominios y despliegue de xHub

VoxTi Labs hospeda xHub para X5. Dos entornos. Nombres definidos por Lino:

| Entorno | Panel del cliente | API pública (por llave) |
|---|---|---|
| **Staging** | `stagexhub.voxtilabs.cl` | `api-stagexhub.voxtilabs.cl` |
| **Producción** | `xhub.voxtilabs.cl` | `api-xhub.voxtilabs.cl` |

El admin del superadmin, mientras no tenga dominio propio, va bajo el panel con
guard de superadmin (y, cuando se decida, Cloudflare Access).

## Por qué la API va en su propio dominio

- **CORS**: el panel es una app de navegador; la API del cliente se consume
  servidor-a-servidor con llave `xhub_`. Separarlos evita relajar el CORS del panel.
- **Seguridad**: cabeceras distintas por superficie.
- **Tráfico**: se escala y protege la API sin tocar el panel.

## Enrutamiento (Traefik / Dokploy)

Todo entra por el proxy inverso; **ningún servicio publica puertos del host**
(ADR 0007). El proxy enruta por Host:

- `stagexhub.voxtilabs.cl` / `xhub.voxtilabs.cl`         → servicio `panel`
- `api-stagexhub.voxtilabs.cl` / `api-xhub.voxtilabs.cl` → servicio `api`

Certificados TLS por Let's Encrypt vía el proxy. HSTS lo emite la **aplicación**,
no solo el borde: detrás del túnel el último salto no es TLS y `x-forwarded-proto`
llega `http`, así que la app decide por `XHUB_ENV`, no por esa cabecera.

## Variables de entorno de dominios

Producción:
```
XHUB_DOMINIO_PANEL=xhub.voxtilabs.cl
XHUB_DOMINIO_API=api-xhub.voxtilabs.cl
XHUB_CORS_ORIGENES=https://xhub.voxtilabs.cl
```

Staging:
```
XHUB_DOMINIO_PANEL=stagexhub.voxtilabs.cl
XHUB_DOMINIO_API=api-stagexhub.voxtilabs.cl
XHUB_CORS_ORIGENES=https://stagexhub.voxtilabs.cl
```

`XHUB_CORS_ORIGENES` es una **lista cerrada** en producción (nunca reflejar el
Origin recibido). Los nombres no están horneados en el build: cambiarlos es cambiar
el `.env`, no recompilar.

## Lo que hay que pedir a quien administra el DNS

1. Registros que resuelvan los cuatro dominios al borde (Cloudflare/VPS).
2. Si van tras Cloudflare: los `CNAME` al túnel o a la IP del proxy.
3. Certificado por Let's Encrypt en el proxy (o el de Cloudflare).

## Orden de arranque

1. **Staging** primero (`stagexhub` + `api-stagexhub`) y validar el pipeline completo.
2. Producción (`xhub` + `api-xhub`) solo cuando staging esté verde de punta a punta
   y con un ensayo de migración hecho (ADR 0007).
