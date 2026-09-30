"use client";
import { apiFetch } from "@/lib/api";

export type Estado = "nuevo" | "abierto" | "pendiente" | "resuelto" | "cerrado";
export type Prioridad = "baja" | "media" | "alta" | "urgente";
export type TicketRow = { id: string; numero: string; persona_id: string; asunto: string; estado: Estado; prioridad: Prioridad; canal_origen: string | null; asignado_a: string | null; asignado_usuario?: string | null; resumen: string | null; sla_incumplido?: boolean };
export type Bandeja = { datos: TicketRow[]; siguiente: string | null; porEstado: Record<string, number>; sinAsignar: number; vencidos: number; puede: { gestionar: boolean } };
export type Identidad = { canal: string; identificador: string };
export type Detalle = TicketRow & { categoria: string | null; etiquetas: string[]; asignado_usuario: string | null; urgencia_detectada: string | null; sla_primera_resp_vence: string | null; sla_resolucion_vence: string | null; primera_respuesta_en: string | null; resuelto_en: string | null; satisfaccion: number | null; sla_incumplido: boolean; creado_en: string; actualizado_en: string; persona_nombre?: string | null; persona_identidades?: Identidad[]; puede: { gestionar: boolean } };
export type Mensaje = { seq: number; autor_tipo: "persona" | "agente" | "sistema"; autor_id: string | null; cuerpo: string; interno: boolean; creado_en: string };
export type Contexto = { omnicanal: { tipo: string; modulo: string; ocurrioEn: string; resumen: string | null }[]; reincidencia: { totalTickets: number; ultimos30: number; esRecurrente: boolean; mismoCanal: Record<string, number> } };

export const TRANS: Record<Estado, Estado[]> = { nuevo: ["abierto", "cerrado"], abierto: ["pendiente", "resuelto", "cerrado"], pendiente: ["abierto", "resuelto", "cerrado"], resuelto: ["abierto", "cerrado"], cerrado: ["abierto"] };
export const ESTADOS: Estado[] = ["nuevo", "abierto", "pendiente", "resuelto", "cerrado"];

const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return s ? "?" + s : ""; };

export const getBandeja = (estado?: string, cursor?: string) => apiFetch<Bandeja>(`/cliente/tickets${qs({ estado, cursor })}`);
export const getTicket = (id: string) => apiFetch<Detalle>(`/cliente/tickets/${id}`);
export const getMensajes = (id: string) => apiFetch<{ datos: Mensaje[] }>(`/cliente/tickets/${id}/mensajes`);
export const getContexto = (id: string) => apiFetch<Contexto>(`/cliente/tickets/${id}/contexto`);
export const getSugerencia = (id: string) => apiFetch<{ sugerencia: string | null }>(`/cliente/tickets/${id}/sugerencia`);
export const responder = (id: string, cuerpo: string) => apiFetch(`/cliente/tickets/${id}/responder`, { method: "POST", body: JSON.stringify({ cuerpo }) });
export const notaInterna = (id: string, cuerpo: string) => apiFetch(`/cliente/tickets/${id}/nota`, { method: "POST", body: JSON.stringify({ cuerpo }) });
export const cambiarEstado = (id: string, estado: Estado) => apiFetch<TicketRow>(`/cliente/tickets/${id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) });
export const resumirTicket = (id: string) => apiFetch<{ resumen: string }>(`/cliente/tickets/${id}/resumir`, { method: "POST" });
export const crearTicket = (b: { canal: string; identidad: string; asunto: string; prioridad?: Prioridad; cuerpo?: string; categoria?: string }) => apiFetch<TicketRow>(`/cliente/tickets`, { method: "POST", body: JSON.stringify(b) });
export const getMetricas = () => apiFetch<{ porEstado: Record<string, number>; porPrioridad: Record<string, number>; abiertos: number; vencidos: number; csat: { prom: number; n: number } }>(`/cliente/metricas`);

export type Agente = { id: string; email: string; nombre: string | null; rol: string };
export const getAgentes = () => apiFetch<{ datos: Agente[] }>("/cliente/agentes");
export const asignar = (id: string, usuario: string | null) => apiFetch<{ ok: boolean; asignado_usuario: string | null }>(`/cliente/tickets/${id}/asignar`, { method: "PUT", body: JSON.stringify({ usuario }) });
export const cambiarPrioridad = (id: string, prioridad: Prioridad) => apiFetch<{ ok: boolean }>(`/cliente/tickets/${id}/prioridad`, { method: "PUT", body: JSON.stringify({ prioridad }) });

export type Macro = { id: string; titulo: string; cuerpo: string };
export const getMacros = () => apiFetch<{ datos: Macro[] }>("/cliente/macros");
export const crearMacro = (titulo: string, cuerpo: string) => apiFetch<Macro>("/cliente/macros", { method: "POST", body: JSON.stringify({ titulo, cuerpo }) });
export const borrarMacro = (mid: string) => apiFetch(`/cliente/macros/${mid}`, { method: "DELETE" });
export const guardarEtiquetas = (id: string, etiquetas: string[]) => apiFetch<{ ok: boolean; etiquetas: string[] }>(`/cliente/tickets/${id}/etiquetas`, { method: "PUT", body: JSON.stringify({ etiquetas }) });

export type Categoria = { id: string; nombre: string };
export const getCategorias = () => apiFetch<{ datos: Categoria[] }>("/cliente/categorias");
export const crearCategoria = (nombre: string) => apiFetch<Categoria>("/cliente/categorias", { method: "POST", body: JSON.stringify({ nombre }) });
export const cambiarCategoria = (id: string, categoria: string | null) => apiFetch<{ ok: boolean }>(`/cliente/tickets/${id}/categoria`, { method: "PUT", body: JSON.stringify({ categoria }) });
export const calificarCsat = (id: string, estrellas: number) => apiFetch<{ ok: boolean }>(`/cliente/tickets/${id}/csat`, { method: "PUT", body: JSON.stringify({ estrellas }) });

// Puente xTickets ↔ xCRM: las oportunidades de la persona del ticket, y abrir una desde aquí.
export type OportunidadDeTicket = { id: string; titulo: string; valor: number; moneda: string; estado: string; etapa: string | null };
export type TicketCrm = { habilitado: boolean; oportunidades: OportunidadDeTicket[]; puedeGestionar: boolean };
export const getTicketCrm = (id: string) => apiFetch<TicketCrm>(`/cliente/tickets/${id}/crm`);
export const crearOportunidadDesdeTicket = (id: string, b: { titulo?: string; valor?: number; moneda?: string }) =>
  apiFetch<{ id: string; titulo: string }>(`/cliente/tickets/${id}/crm/oportunidad`, { method: "POST", body: JSON.stringify(b) });
