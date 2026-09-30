# Auditoría final de alcance XHub

Fecha: 2026-09-30T04:26:07.154Z

Base funcional auditada: `03a0dbc963c94bae308c3b825069060fe1b6cd3c` (`feat/tickets-reales`). HEAD local al generar este informe: `03a0dbc963c94bae308c3b825069060fe1b6cd3c`. No se modificó el producto durante esta auditoría.

## Conteo correcto

**21 archivos page.tsx: 20 plantillas de producto y 1 raíz de redirección.** La galería final contiene **93 capturas**, incluidas las 20 plantillas en escritorio y móvil, formularios, diálogos y estados representativos. Los 23 artefactos de una compilación Next no equivalen a 23 funcionalidades ni a un inventario de pantallas. Cada registro dinámico reutiliza su plantilla.

**No faltan rutas fuente ni plantillas de producto en la galería.** La revisión incluyó superficies que no aparecen en el menú principal.

## Plantillas y evidencia

| Ruta | Superficies existentes revisadas por código | Capturas registradas | Límite de la evidencia |
|---|---|---|---|
| `/login` | Correo, contraseña, mostrar/ocultar contraseña, aviso de Bloq Mayús, inicio de sesión, estado enviando/error, tema independiente y aviso de solicitar cuenta al administrador. | 2: Vista principal | No se capturan todos los errores, contraseña visible o aviso de Bloq Mayús. |
| `/equipo` | Uso/límite de usuarios; tarjetas admin/agente; permisos plegables con cada interruptor; formulario nombre/correo/contraseña; tope alcanzado; feedback. | 6: Vista principal; Modo oscuro; Permisos del equipo | No se capturan todas las combinaciones de permisos, éxito/error o límite de usuarios. |
| `/ajustes/webhooks` | Formulario URL+eventos; crear webhook; tarjeta del secreto mostrado una sola vez; endpoints activos/inactivos; activar/desactivar/borrar; historial de entregas con código y estado. | 3: Vista principal; Webhook creado · secreto ficticio | Secreto ficticio incluido. No se capturan todas las respuestas de entrega o errores de creación. |
| `/tickets` | Lista y tablero; búsqueda/estado vacío; filtros Todos/Nuevo/Abierto/Pendiente/Resuelto/Cerrado y Míos/Sin asignar; contadores; prioridad/canal/agente/SLA; drag/drop con TRANS; permiso gestión; Nuevo ticket; toast. | 11: Vista principal; Menú de cuenta; Modo oscuro; Modo soporte activo; Vista de tablero; Bandeja sin tickets; Acceso denegado por permiso; Navegación móvil | Incluye lista, tablero, vacío, denegado, cuenta, soporte, móvil y oscuro. No se capturan todos los filtros y combinaciones de SLA. |
| `/tickets/nuevo` | Canal, prioridad, identidad, asunto, categoría y mensaje inicial; validación, enviando, errores; creación API y redirección al detalle; cancelar. | 2: Vista principal | Formulario capturado; validación y payload probados con fixture local. No se capturan todos los errores API. |
| `/tickets/[id]` | Cabecera con estado/prioridad/urgencia/SLA y nombre/contactos de la persona (teléfono, email, RUT, XContact); asignación, prioridad, transiciones; categoría y etiquetas; resumen IA; mensajes públicos/internos/sistema; respuesta pública/nota; macros; sugerencia IA; contexto omnicanal; reincidencia; CSAT; oportunidades CRM y crear oportunidad. | 7: Vista principal; Error de carga recuperable; Nota interna y macros; Ticket resuelto y satisfacción CSAT; Ticket con acceso de lectura | Incluye nota/macros, CSAT resuelto, lectura y error. No se captura cada prioridad, transición o respuesta IA. |
| `/tickets/metricas` | Abiertos, vencidos, CSAT y número de calificaciones; distribución por estado y prioridad; carga/error/sin datos. | 2: Vista principal | Distribuciones y CSAT capturados; no todas las combinaciones de métricas vacías o errores. |
| `/leads` | Listado de leads con valor/origen/persona; nuevo formulario canal/identidad/título/valor/moneda/origen; convertir a oportunidad y navegar; archivar; estados vacío/error. | 4: Vista principal; Formulario de nuevo lead | Lista y formulario capturados; no todas las variantes de conversión, archivo o feedback. |
| `/oportunidades` | Contadores, pipeline selector; crear pipeline; configuración de etapas; crear etapa y probabilidad; eliminar etapa; nuevo formulario canal/identidad/título/valor/moneda/etapa/cierre/empresa; filtro etiquetas; tablero y drag/drop; cerrar ganada/perdida con motivo. | 15: Vista principal; Diálogo de nueva etapa; Diálogo de motivo de pérdida; Diálogo de nuevo pipeline; Diálogo de probabilidad de cierre; Formulario de nueva oportunidad; Modo oscuro; Configuración del pipeline | Formulario, configuración y los cuatro diálogos capturados. No se capturan todas las combinaciones de etapas, permisos y arrastre. |
| `/oportunidades/[id]` | Estado/etapa/valor/persona; etiquetas; actividad con tipos nota/llamada/email/reunión/tarea; productos del catálogo o manuales, cantidad/precio/agregar/quitar y total; cronología/tareas completables; tickets relacionados. | 2: Vista principal | Actividad, productos, tareas y relacionados capturados en una ficha representativa; no cada opción del formulario. |
| `/organizaciones` | Directorio empresas con rubro/web/teléfono, volumen de negocios y valor; formulario nueva empresa nombre/web/rubro/teléfono; estados carga/vacío/error. | 4: Vista principal; Formulario de nueva empresa | Directorio y formulario capturados; no todas las combinaciones de datos faltantes o errores. |
| `/insights` | Forecast, ganado, tasa conversión, leads activos; gráfico valor y cantidad por etapa/probabilidad; carga/error. | 2: Vista principal | Gráficos y métricas capturados; no todas las combinaciones de datos vacíos. |
| `/persona` | Estado inicial de búsqueda; búsqueda por nombre/email/teléfono; resultados y sin resultados; ficha seleccionada con identidades y etiquetas; aviso de datos espejados, fuente, fecha de sincronización y antigüedad; historia omnicanal; tickets navegables y oportunidades. | 9: Vista principal; Bienvenida y búsqueda inicial; Datos espejados · sincronización desactualizada; Datos espejados · sincronización reciente; Resultados de búsqueda; Búsqueda sin resultados | Inicio, resultados, vacío, ficha y avisos de sincronización reciente/desactualizada capturados. No hay tres tabs Historia/Identidades/Datos en esta versión; la ficha muestra sus secciones directamente. |
| `/superadmin` | Panorama de operación; planes con crear/borrar y aplicar; alta cliente; directorio con estados, módulos, enlaces y resumen por cliente; editor Marca plegable; crear llave y tarjeta token; acceso de soporte mediante motivo. | 7: Vista principal; Diálogo de acceso de soporte; Editor de marca del cliente; Llave API creada · token ficticio | Planes, cliente, marca, diálogo de soporte y token ficticio capturados; soporte activo figura en Bandeja. No todas las variantes de error o feedback. |
| `/superadmin/cliente` | Selector por query id; estado cliente; módulos; cuota/consumo; usuarios y límite con alta admin; triage modo/umbral; actividad IA; proveedor/estado IA y modelo global+override cliente; llaves crear/listar/scopes/revocar y tarjeta token único. | 5: Vista principal; Alcances de la llave de API; Llave API del cliente · token ficticio | Configuración completa, IA, scopes y token ficticio capturados. No todas las combinaciones de módulos, cuota, límite o revocación. |
| `/superadmin/auditoria` | Cadena íntegra/rota; filtros actor/recurso/desde/hasta; aplicar; exportar; tabla entradas/resultado; carga/error/vacío. | 2: Vista principal | Filtros y cadena íntegra capturados; no cadena rota ni cada resultado de exportación. |
| `/ia` | Ventana temporal 7/30/90 días; totales llamadas/tokens/latencia; tareas/proveedores; tabla últimas llamadas con fallos; carga/error. | 2: Vista principal | Actividad y filtros capturados; no cada ventana temporal o fallo de proveedor. |
| `/superadmin/xcontact` | Selector cliente; instancias registradas, salud y cargar/borrar/sincronizar; prueba host/supervisor/contraseña/API key; resultados capacidades/checks/latencia; guardar instancia nombre y referencia de credencial. | 4: Vista principal; Resultado de prueba de conexión | Instancias, formulario y prueba correcta capturados; no todos los fallos de conexión/sincronización. |
| `/superadmin/salud-xcontact` | Estado global y contadores; recargar; tarjetas instancias/capacidades/última prueba; enlace a prueba de conexión; carga/error/vacío. | 2: Vista principal | Flota representativa capturada; no todas las combinaciones de estado o error. |
| `/superadmin/muertos` | Lista cola de muertos con causa/payload/intentos/fechas; contraseña supervisor; reintentar todos o uno; estado ocupado, resultado y cola vacía. | 2: Vista principal | Cola, payload y reintentos capturados; no cada longitud de payload ni resultado del reintento. |

## Estados adicionales comprobados visualmente

- Datos espejados recientes: `personas--fuente-reciente--desktop--claro`, `personas--fuente-reciente--mobile--claro`.
- Datos espejados desactualizados: `personas--fuente-antigua--desktop--claro`, `personas--fuente-antigua--mobile--claro`.
- Persona inicial: `personas--bienvenida--desktop--claro`.
- Resultados de personas: `personas--resultados--desktop--claro`.
- Búsqueda sin resultados: `personas--sin-resultados--mobile--claro`.
- Ticket resuelto y CSAT: `ticket-detalle--resuelto-csat--desktop--claro`.
- Ticket de sólo lectura: `ticket-detalle--solo-lectura--desktop--claro`.
- Lista de tickets vacía: `tickets--vacio--desktop--claro`.
- Error de carga: `ticket-detalle--error-carga--desktop--claro`.
- Acceso denegado: `tickets--acceso-denegado--mobile--claro`.
- Menú de cuenta: `tickets--cuenta--desktop--claro`.
- Soporte activo: `tickets--soporte-activo--desktop--claro`.
- Token API plataforma: `clientes--token-ficticio--desktop--claro`.
- Token API cliente: `cliente-detalle--token-ficticio--desktop--claro`.
- Secreto webhook: `webhooks--secreto-ficticio--desktop--claro`.
- Probabilidad de etapa: `oportunidades--dialog-probabilidad--desktop--claro`.

## Qué demuestra la revisión

- Las 20 plantillas y sus controles, condiciones y acciones se revisaron en código. El JSON incluye nombres, líneas y referencias de capturas. No se cuentan controles AST como funcionalidades únicas.
- Formularios, tokens, claves, avisos y permisos utilizan los componentes, iconos y colores compartidos. La galería incluye representantes visuales de estas familias.
- Tickets tiene 17 pruebas UI aprobadas contra fixture local, con 0 errores JavaScript. Las cinco capturas complementarias de Tickets también tienen 0 errores JavaScript y 0 desbordamientos. El HTTP 503 de la captura de error fue inducido intencionalmente en el navegador.
- Los estados especiales usan datos ficticios y respuestas HTTP aisladas. Los tokens y secretos de las capturas no son credenciales reales.
- No se prueba cada combinación de roles, permisos, datos, dispositivos o errores. La revisión local no verifica la API real, persistencia ni integraciones externas.

## Otros frontends y límites del alcance

- `apps/panel` es el único frontend Next del monorepo. `apps/api` y `apps/workers` no son otro panel.
- `/` es una redirección. Tickets y oportunidades usan rutas `[id]`; cliente usa parámetro `id`. No se cuentan registros como plantillas nuevas.
- La documentación técnica `/docs` y `/api/docs` conserva Scalar. Está separada del producto y no se cuenta como omisión del diseño.
- `packages/ui/preview` contiene tres prototipos estáticos históricos, sin rutas productivas en el App Router.
- GitHub confirmó `voxtilabs/xhub-modulos` privado y archivado. La memoria `docs/memoria/xhub-x5-voxtilabs.md`, línea 120, documenta la vuelta de xTickets al monorepo; los documentos previos de separación quedaron superados.
- `docs/despliegue/DOMINIOS.md`, líneas 48–50, enlaza stagexhub y tickets-stagexhub al mismo servicio panel. Esta evidencia no confirma el SHA servido actualmente por staging.
- Los controles nativos de archivo, color o navegador no son pantallas propias del producto.

## Resultado y límites restantes

- No se identificaron plantillas de producto ni superficies únicas existentes omitidas del diseño. Las 20 plantillas están representadas y los 16 estados adicionales coordinados tienen capturas.
- No se ejecutó ni capturó cada combinación de rol, permiso, datos o error. La evidencia visual representa familias de estados y no equivale a pruebas exhaustivas de comportamiento.
- La API real, persistencia, integraciones externas y el SHA desplegado en staging no quedan verificados por esta galería con datos ficticios locales.

La referencia anterior a base 78f541 y el conteo de 23 páginas del README se corrigieron durante esta auditoría; no son brechas actuales. La base funcional auditada se actualizó de b660 a 03a0dbc y el conteo correcto es 20 plantillas más 1 raíz de redirección.
