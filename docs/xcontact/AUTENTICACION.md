# Autenticación de XContact — verificada contra la demo

Verificado el 2026-09-23 contra `192.168.37.212` (entorno **demo**, usuario y clave
`admin`). Todo lo de aquí está **ejecutado, no supuesto**.

## Login de supervisor (v4)

```
POST https://<host>:8004/api/v4/login/supervisor
Content-Type: application/json

{ "nome": "admin", "senha": "admin" }
```

Respuesta 200 con el usuario y, lo que importa:

| Campo | Uso |
|---|---|
| `token` | UUID. Es el bearer para todo lo demás |
| `session_id` | UUID de la sesión |
| `token_create` | Sello de creación del token |
| `modulos` | **Árbol de módulos que ve este supervisor** — el equivalente a sus permisos |
| `filas`, `gruposFila` | Colas asignadas (vacías en la demo) |
| `duplo_fator_secret/_uri/_qr` | Null aquí: **la demo no tiene 2FA**. En real puede venir |
| `senha` | ⚠️ Devuelve el hash MD5 de la clave en la respuesta del login. Hallazgo de seguridad de SU producto (MD5, y no debería viajar) |

`ip_login` y `pc_login` quedan registrados server-side: **el login deja rastro**. No
es anónimo; conviene usar una credencial de integración, no la de una persona.

## Cómo se autentican las demás llamadas

```
Authorization: Bearer <token>
```

Confirmado con `/v4/servidor/horario`:

| Cómo | Resultado |
|---|---|
| `Authorization: Bearer <token>` | **200** |
| `Authorization: <token>` (pelado) | 401 "Missing authentication" |
| sin cabecera | 401 |

## La lección, ahora con datos: el nombre del módulo NO es la ruta

Barrido de lectura sobre la demo. El nombre del módulo en el código del inventario
**no coincide** con la ruta HTTP:

| Se esperaría | Real | Nota |
|---|---|---|
| `/v4/fila` (404) | **`/v4/filas/...`** | plural, y sin listado raíz: todo cuelga de sub-rutas |
| `/v4/chat` (404) | **`/v4/chats`** | plural |
| `/v4/campanhas` (404) | `/v4/campanhas/registrosTags`, `/temposMovimentos` | sin listado raíz |
| `/v4/contato` | **no hay listado** | solo `/v4/contato/findCliente/{Numero}` y `/v4/contato/{AgenteFullName}/{ContatoID}` |
| `/v4/agente` (200) | `/v4/agente` | aquí sí coincide |
| `/v4/tags` (200) | `/v4/tags`, `/v4/tags/grupos` | coincide |

**Conclusión para el conector:** la ruta de cada operación se toma **del contrato
congelado**, nunca del nombre del módulo. Es exactamente el trabajo de la matriz de
cobertura (#8): mapear nombre→ruta real, operación por operación.

## Forma de las respuestas de listado

`/v4/filas/ligacoes` responde con envoltorio de paginación:

```json
{ "dados": [...], "full": <n>, "total": <n>, "error": ..., "message": ... }
```

El conector debe leer `dados` para los elementos y `total`/`full` para paginar. Es la
forma a codificar en el cliente tipado (#46) y la paginación (#52).

## Estado de la demo

Vacía de datos de negocio (agentes, chats, tags, contactos → listas vacías). Sirve
para **verificar auth, rutas y formato**, no para ver volumen ni probar escrituras
sobre datos reales. Refuerza la petición de un entorno propio con datos sintéticos
(#142).
