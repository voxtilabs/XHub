# Horizon: actualización visual del panel de xHub

## Base de integración

Esta entrega parte de main, commit c5c30eea5f21bf97cca5492f7c5fa514eb00d4b6, que incorpora la PR #231 de LiinooRF. La PR visual #233 se actualiza en style/horizon-completo y su destino pasa a main. El historial anterior de la PR se conserva sin forzar el push.

Se mantienen expresamente las dos incorporaciones frontend recientes de main: datos estructurados y ejemplos de IA (GET/PUT /cliente/ia-datos), y catálogo de automatizaciones por cliente (GET/PUT /admin/clientes/:id/automatizaciones). No se recupera el antiguo control fichaEnAbandonadas.

## Cambios

- Identidad navy/champán y versión clara, ilustraciones de cabecera y su unión sin cortes en pantallas anchas.
- Menú plegable, fondo geométrico, iconos SVG, perfiles circulares y navegación con respuesta visual inmediata.
- Diseño de equipo, IA, llaves de API, webhooks, bandeja, métricas, CRM, auditoría y administración.
- Reflujo móvil, tipografías locales, controles de teclado, reducción de movimiento y scroll sin barras decorativas invasivas.
- Optimización de frontend: enlaces Next, carga paralela de secciones independientes, menos peticiones duplicadas del embudo, observadores visuales acotados y retención de rutas compiladas durante desarrollo.

## Alcance técnico

El diff contra main se limita a apps/panel, packages/ui/src/tokens.css y documentación de diseño. API, workers, módulos, migraciones, autenticación, middleware, proxy y workflows permanecen iguales a main. lib/api.ts se conserva exactamente. El cambio en useYo únicamente cancela actualizaciones de estado tras desmontar; no almacena ni cambia permisos.

Los diálogos visuales sustituyen prompts nativos conservando validaciones y cancelación. La revisión de integración compara peticiones y payloads con main. No se incluyen cambios de configuración local, credenciales, sesiones, bases de datos ni herramientas de prueba.

## Evidencia y límites

La validación responsive previa cubrió Chromium/Edge y Firefox, anchos de 320 a 1920px y ambos temas; las fuentes son locales. La revisión reciente de Llaves de API comprobó selección, teclado, estado heredado y ausencia de desbordamientos en el navegador integrado.

Las mediciones locales de navegación mostraron mejoras en cuatro rutas, pero no se presenta una garantía de latencia ni de rendimiento del backend. El entorno local es de desarrollo y también incurre en compilación inicial. Safari/iPhone físico no está verificado.

Esta es una entrega de frontend para revisión. No certifica todas las integraciones externas ni la persistencia en producción; no despliega ni fusiona main. Las pruebas de negocio del repositorio se ejecutan en el CI de GitHub con su base de datos aislada.

## Contenido de la entrega

No se publican la base local, usuarios, tickets, oportunidades, fixtures, sesiones ni capturas con datos de prueba. La evidencia visual detallada se conserva fuera del repositorio. Los WebP del panel son únicamente las ilustraciones y los fondos aprobados; los ejemplos de texto de los formularios son ayudas de interfaz, no registros precargados.

La compilación de producción y la validación TypeScript pasan. La comparación estática de llamadas directas de API/autenticación en 49 archivos TS/TSX no encuentra diferencias en sus argumentos contra main; la revisión manual conserva también la serialización original de los filtros de auditoría.
