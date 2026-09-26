# Dominios y despliegue de xHub

## Los dominios

VoxTi Labs hospeda xHub para X5. Dos entornos, y por entorno hasta tres caras
(el navegador del panel, la API pública del cliente, el admin superadmin).

| Entorno | Panel del cliente | API pública (por llave) | Admin (superadmin) |
|---|---|---|---|
| Staging | `staging.xhub.voxtilabs.cl` | `api-staging.xhub.voxtilabs.cl` | `admin-staging.xhub.voxtilabs.cl` |
| Producción | `xhub.voxtilabs.cl` | `api.xhub.voxtilabs.cl` | `admin.xhub.voxtilabs.cl` |

> **Nota sobre nombres.** Lino mencionó `stagexhub.voxtilabs.cl`. Se recomienda
> `staging.xhub.voxtilabs.cl` (subdominio anidado, más legible y ordena todo bajo
> `xhub.voxtilabs.cl`). Cualquiera funciona: los nombres se inyectan por variable
> de entorno (`XHUB_DOMINIO_*`), no están horneados en el código.

## Por qué la API va en su propio dominio

- **CORS**: el panel es una app de navegador; la API del cliente se consume
  servidor-a-servidor con llave `xhub_`. Separarlos evita relajar CORS del panel.
- **Seguridad**: cabeceras distintas por superficie (la API no necesita las de una
  app de navegador; el panel sí). Y el admin puede ir tras Cloudflare Access.
- **Tráfico**: se puede escalar y proteger la API sin tocar el panel.

## Cómo se enrutan (Traefik / Dokploy)

Todo entra por el proxy inverso; **ningún servicio publica puertos del host**
(ADR 0007). El proxy enruta por Host:

- `xhub.voxtilabs.cl`      → servicio `panel`
- `api.xhub.voxtilabs.cl`  → servicio `api`
- `admin.xhub.voxtilabs.cl`→ servicio `admin` (o `panel` con guard de superadmin)

Certificados TLS por Let's Encrypt vía el proxy. HSTS lo emite la **aplicación**
(no solo el borde): detrás del túnel el último salto no es TLS y `x-forwarded-proto`
llega `http`, así que la app decide por `XHUB_ENV`, no por esa cabecera.

## Variables de entorno de dominios

```
XHUB_DOMINIO_PANEL=xhub.voxtilabs.cl
XHUB_DOMINIO_API=api.xhub.voxtilabs.cl
XHUB_DOMINIO_ADMIN=admin.xhub.voxtilabs.cl
XHUB_CORS_ORIGENES=https://xhub.voxtilabs.cl,https://admin.xhub.voxtilabs.cl
```

En staging, los mismos con el prefijo del entorno. `XHUB_CORS_ORIGENES` es una
**lista cerrada** en producción (nunca reflejar el Origin recibido).

## Lo que hay que pedir a quien administra el DNS

1. Registros que resuelvan los dominios al borde (Cloudflare/VPS).
2. Si van tras Cloudflare: los `CNAME` al túnel o a la IP del proxy.
3. El **admin** conviene protegerlo con Cloudflare Access (correos autorizados),
   como en IAxTi.

## Orden de arranque sugerido

1. Crear **staging** primero y validar el pipeline completo ahí.
2. Producción solo cuando staging esté verde de punta a punta y con un ensayo de
   migración hecho (ADR 0007).
