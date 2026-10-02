import { Icon } from "@/components/icon";

// Section descriptions only. Availability and permissions stay with each page.
const features = {
  equipo: [["users-three", "Usuarios y roles"], ["shield-check", "Permisos de acceso"]],
  tickets: [["chats-circle", "Atención omnicanal"], ["ticket", "Seguimiento de tickets"]],
  "ticket-nuevo": [["chat-circle-dots", "Conversaciones conectadas"], ["ticket", "Gestión de solicitudes"]],
  metricas: [["chart-line", "Indicadores de atención"], ["gauge", "Visión de tu operación"]],
  leads: [["user-plus", "Nuevos contactos"], ["clock-counter-clockwise", "Seguimiento comercial"]],
  oportunidades: [["kanban", "Embudo de ventas"], ["flag-banner", "Seguimiento comercial"]],
  organizaciones: [["buildings", "Cuentas conectadas"], ["users-three", "Relaciones comerciales"]],
  insights: [["chart-line", "Actividad comercial"], ["kanban", "Visión del embudo"]],
  webhooks: [["webhooks-logo", "Eventos y entregas"], ["plugs-connected", "Integraciones"]],
  "ajustes-ia": [["cpu", "Preferencias de IA"], ["chats-circle", "Asistencia al equipo"]],
  automatizaciones: [["lightning", "Reglas y condiciones"], ["plugs-connected", "Acciones conectadas"]],
  desarrollo: [["key", "Claves de API"], ["note-pencil", "Documentación"]],
  seguridad: [["lock-key", "Acceso seguro"], ["shield-check", "Verificación en dos pasos"]],
  ia: [["waveform", "Consumo y actividad"], ["cpu", "Seguimiento de modelos"]],
  clientes: [["buildings", "Clientes y módulos"], ["sliders-horizontal", "Gestión de plataforma"]],
  cliente: [["building-office", "Configuración del cliente"], ["plugs-connected", "Módulos e integraciones"]],
  xcontact: [["plugs-connected", "Instancias y conexiones"], ["headset", "Capacidades de XContact"]],
  salud: [["pulse", "Estado de conectores"], ["gauge", "Supervisión operativa"]],
  reintentos: [["clock", "Trabajos pendientes"], ["arrows-clockwise", "Gestión de reintentos"]],
  auditoria: [["clock-counter-clockwise", "Registro de actividad"], ["shield-check", "Trazabilidad de acciones"]],
} as const;

export function HeroFeatures({ variant }: { variant: keyof typeof features }) {
  return <div className="xhub-hero-features">{features[variant].map(([icon, label]) => (
    <span key={label}><Icon name={icon} weight="regular" />{label}</span>
  ))}</div>;
}
