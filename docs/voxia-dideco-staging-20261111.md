# DIDECO y diagnóstico de avisos de voz — staging

La API de creación de tickets admite `categoria`, opcional y limitada a 100
caracteres. La categoría se registra dentro del mismo cliente y transacción;
no asigna agentes ni equipos y no modifica los datos de identidad. Las llamadas
existentes sin categoría mantienen su contrato.

`POST /v1/tickets/avisos-voz/diagnostico`, con permiso `tickets.notificar`, acepta
`telefonosPermitidos` y entrega contadores de tickets de origen `voz_ia`, sin
reservar llamadas. Separa consentimiento, teléfono, respuesta pública, lista
permitida, límite diario y estados de entrega. Los contadores pueden solaparse:
no representan un embudo ni incluyen cuerpos de respuesta, RUT o teléfonos.

Desplegar en XHub staging antes de activar `api_category_enabled` en el catálogo
de VoxIA. La API anterior rechaza `categoria` como campo desconocido; por ello
VoxIA mantiene desactivado ese campo hasta comprobar el despliegue. Mientras
tanto conserva DIDECO y la unidad responsable en el cuerpo del ticket.

Verificación: lint, typecheck, build y suite completa del monorepo; pruebas con
PostgreSQL/Redis aislados para validación de categorías, separación de clientes,
permisos y diagnóstico sin reservas. No se realizaron llamadas reales.
