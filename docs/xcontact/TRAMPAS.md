# Trampas de la API de XContact

La API de XContact (producto de X5, no nuestro) es frágil, está en portugués y mezcla
generaciones. Este documento lista las trampas conocidas y su workaround. **Cada trampa
nueva que aparezca se agrega en el MISMO PR que la sortea**, con el formato de abajo.

> Formato de cada entrada: **Síntoma** · **Causa** · **Evidencia** · **Workaround**.

---

## T-01 · Conviven cuatro generaciones de API, con vocabulario distinto
- **Síntoma:** `/api/v4/campanhas` da 404, pero `/api/v2/campanhas` existe; los nombres cambian entre v2/v3/v4.
- **Causa:** el mismo servicio (`:8004`) sirve v1, v2, v3 y v4 a la vez, cada una con su vocabulario. `x5.xcontact.cl:8004/swagger.json` declara **464 rutas** ("Xcontact REST API v3.9.15", API REST v2 e v3).
- **Evidencia:** `GET :8004/swagger.json` → 464 paths (grupos: v4=168, v2=149, v3=146, v1=1).
- **Workaround:** fijar la versión por instancia (ADR 0008) y elegir la generación más vieja que cumpla y esté estable. Nunca asumir que "v4" tiene todo: contactos y campañas viven sobre todo en v2/v3.

## T-02 · v5 (:8011) es una superficie aparte, incompleta
- **Síntoma:** `:8011/api/v5/campanhas`, `/contatos`, `/chamadas`, `/relatorios` → 404; `/agentes` → 500.
- **Causa:** v5 (puerto distinto, `:8011`) sólo cubre configuración/colas; el dominio grande (contactos, llamadas, campañas) NO está en v5. `agentes` crashea.
- **Evidencia:** con JWT de supervisor, dan **200**: `filas, ura, clientes, pausas, ramais, troncos, horarios, tags`. Dan **404** el resto; `agentes` da **500**.
- **Workaround:** usar v5 para colas/config y v2–v4 (`:8004`) para el dominio. No hay Swagger en v5 (`:8011/documentation/json` → 404).

## T-03 · Dos autenticaciones distintas por puerto
- **Síntoma:** el token de una superficie no sirve en la otra.
- **Causa:** v5 usa `POST :8011/api/v5/auth/supervisor {username,password}` → JWT (1 h) + refresh (7 d). v2–v4 (`:8004`) usan una **api_key** en header `Authorization` (securityDefinition `Bearer`, tipo apiKey).
- **Evidencia:** `:8011/api/v5/auth/supervisor` → 200 con `{access_token, expiresIn:"1h", refresh_token}`. `:8004/api/v2/campanhas` sin credencial → 401 "Missing authentication".
- **Workaround:** el conector fija auth por instancia. Renovar el JWT v5 con el refresh antes de expirar.

## T-04 · La api_key REST de v4 no es obvia y hay que pedirla habilitada
- **Síntoma:** un token de 64 hex de `configuracoes/sistema` da **401 "Missing authentication"** en `:8004` en toda forma (Authorization crudo/Bearer, `api_key`/`apikey` header, `?api_key=`, `X-API-KEY`).
- **Causa:** ese token no es la api_key REST, o no está provisionado para REST. La api_key REST hay que pedirla a X5 explícitamente y confirmar que habilita las operaciones que necesitamos (ver issue #9).
- **Evidencia:** `:8004/api/v2/campanhas` con el token en todas sus formas → 401.
- **Workaround:** pendiente de X5 — lista de scopes/operaciones requeridas + credencial de integración funcionando. Hasta entonces, v5 cubre colas/config.

## T-05 · TLS con certificado que no corresponde
- **Síntoma:** la verificación TLS estricta falla contra la instancia.
- **Causa:** certificado con SAN que no corresponde / vencido (histórico).
- **Evidencia:** las llamadas del descubrimiento se hicieron con verificación relajada.
- **Workaround:** el conector fija la política TLS por instancia (issue #47). **Verificar, no desactivar** en producción: fijar el CA/host esperado por instancia.

## T-06 · `:8004` responde 400 a HTTP plano
- **Síntoma:** una petición HTTP sin TLS a `:8004` devuelve 400.
- **Causa:** el puerto sólo habla HTTPS.
- **Workaround:** siempre https hacia `:8004`.

## T-07 · Observaciones históricas truncadas a 255 caracteres
- **Síntoma:** textos largos (observaciones/notas) llegan cortados a 255.
- **Causa:** límite de columna en una versión antigua.
- **Workaround:** no asumir que el texto completo sobrevive el viaje de ida y vuelta; guardar la copia canónica en xHub.

## T-08 · Módulos duplicados `_old` y vocabulario en portugués
- **Síntoma:** aparecen tablas/rutas con sufijo `_old`; nombres en portugués (`campanha`, `fila`, `ramal`, `tronco`).
- **Causa:** migraciones a medias dejaron duplicados; el producto es en portugués.
- **Workaround:** el traductor (`mapeo.ts`, issue #49) es el ÚNICO lugar que conoce el portugués; ignorar `_old`.

---

*Instancia observada durante el descubrimiento: `x5.xcontact.cl` (pública, puertos 8004 y 8011). La API es alcanzable sin WireGuard — ver `docs/xcontact/AUTENTICACION.md`.*
