"use client";
import { apiFetch } from "@/lib/api";

export type Etapa = { id: string; nombre: string; orden: number; probabilidad: number };
export type Pipeline = { id: string; nombre: string; orden: number; etapas: Etapa[] };
export type Oportunidad = { id: string; titulo: string; valor: number; moneda: string; etapa_id: string | null; estado: "abierta" | "ganada" | "perdida"; persona_id: string; persona_email: string | null; probabilidad: number | null; cierre_esperado: string | null; creado_en: string; org_id?: string | null; org_nombre?: string | null; etiquetas?: string[] };
export type Embudo = { datos: Oportunidad[]; etapas: Etapa[]; pipelineId: string; resumen: { abiertas: number; valorAbierto: number; ganadas: number; valorGanado: number }; puede: { gestionar: boolean } };
export type Actividad = { id: string; tipo: string; cuerpo: string; hecho: boolean; autor: string | null; creado_en: string };
export type OportunidadDetalle = Oportunidad & { etapa: string | null; motivo_perdida: string | null; actividades: Actividad[]; puede: { gestionar: boolean } };

export const getPipelines = () => apiFetch<{ datos: Pipeline[] }>("/cliente/crm/pipelines");
export const getOportunidades = (pipeline?: string) => apiFetch<Embudo>(`/cliente/oportunidades${pipeline ? `?pipeline=${pipeline}` : ""}`);
export const getOportunidad = (id: string) => apiFetch<OportunidadDetalle>(`/cliente/oportunidades/${id}`);
export type TicketDeOportunidad = { id: string; numero: string; asunto: string; estado: string; prioridad: string; creado_en: string };
export const getTicketsDeOportunidad = (id: string) => apiFetch<{ datos: TicketDeOportunidad[] }>(`/cliente/oportunidades/${id}/tickets`);
export const crearOportunidad = (b: { canal: string; identidad: string; titulo: string; valor?: number; moneda?: string; pipelineId?: string; etapaId?: string; cierreEsperado?: string; probabilidad?: number; orgId?: string }) => apiFetch<Oportunidad>("/cliente/oportunidades", { method: "POST", body: JSON.stringify(b) });
export const moverEtapa = (id: string, etapaId: string) => apiFetch(`/cliente/oportunidades/${id}/etapa`, { method: "PUT", body: JSON.stringify({ etapaId }) });
export const cerrarOportunidad = (id: string, estado: "ganada" | "perdida", motivo?: string) => apiFetch(`/cliente/oportunidades/${id}/cerrar`, { method: "PUT", body: JSON.stringify({ estado, motivo }) });
export const agregarActividad = (id: string, tipo: string, cuerpo: string) => apiFetch<Actividad>(`/cliente/oportunidades/${id}/actividades`, { method: "POST", body: JSON.stringify({ tipo, cuerpo }) });
export const marcarHecho = (id: string, aid: string, hecho: boolean) => apiFetch(`/cliente/oportunidades/${id}/actividades/${aid}/hecho`, { method: "PUT", body: JSON.stringify({ hecho }) });

export type Organizacion = { id: string; nombre: string; sitio_web: string | null; rubro: string | null; telefono: string | null; deals?: number; valor_abierto?: number };
export const getOrganizaciones = () => apiFetch<{ datos: Organizacion[] }>("/cliente/crm/organizaciones");
export const crearOrganizacion = (b: { nombre: string; sitioWeb?: string; rubro?: string; telefono?: string }) => apiFetch<Organizacion>("/cliente/crm/organizaciones", { method: "POST", body: JSON.stringify(b) });
export type Lead = { id: string; titulo: string; valor: number; moneda: string; origen: string | null; estado: string; persona_email: string | null; creado_en: string };
export const getLeads = () => apiFetch<{ datos: Lead[] }>("/cliente/crm/leads");
export const crearLead = (b: { canal: string; identidad: string; titulo: string; valor?: number; moneda?: string; origen?: string }) => apiFetch<Lead>("/cliente/crm/leads", { method: "POST", body: JSON.stringify(b) });
export const convertirLead = (id: string) => apiFetch<{ ok: boolean; dealId: string }>(`/cliente/crm/leads/${id}/convertir`, { method: "POST" });
export const archivarLead = (id: string) => apiFetch(`/cliente/crm/leads/${id}/archivar`, { method: "PUT" });
export type Insights = { forecast: number; porEtapa: { nombre: string; probabilidad: number; n: number; valor: number }[]; ganadas: { n: number; valor: number }; perdidas: { n: number }; tasaConversion: number; leadsActivos: number };
export const getInsights = () => apiFetch<Insights>("/cliente/crm/insights");
export type Producto = { id: string; nombre: string; codigo: string | null; precio: number; moneda: string };
export type DealProducto = { id: string; producto_id: string | null; nombre: string; cantidad: number; precio: number };
export const getProductos = () => apiFetch<{ datos: Producto[] }>("/cliente/crm/productos");
export const crearProducto = (b: { nombre: string; codigo?: string; precio?: number; moneda?: string }) => apiFetch<Producto>("/cliente/crm/productos", { method: "POST", body: JSON.stringify(b) });
export const getDealProductos = (id: string) => apiFetch<{ datos: DealProducto[] }>(`/cliente/oportunidades/${id}/productos`);
export const addDealProducto = (id: string, b: { productoId?: string; nombre?: string; cantidad?: number; precio?: number }) => apiFetch<DealProducto>(`/cliente/oportunidades/${id}/productos`, { method: "POST", body: JSON.stringify(b) });
export const quitarDealProducto = (id: string, lid: string) => apiFetch(`/cliente/oportunidades/${id}/productos/${lid}`, { method: "DELETE" });
export const crearPipeline = (nombre: string) => apiFetch<Pipeline>("/cliente/crm/pipelines", { method: "POST", body: JSON.stringify({ nombre }) });
export const agregarEtapa = (pipelineId: string, nombre: string, probabilidad: number) => apiFetch<Etapa>(`/cliente/crm/pipelines/${pipelineId}/etapas`, { method: "POST", body: JSON.stringify({ nombre, probabilidad }) });
export const borrarEtapa = (id: string) => apiFetch(`/cliente/crm/etapas/${id}`, { method: "DELETE" });

export const guardarEtiquetasDeal = (id: string, etiquetas: string[]) => apiFetch<{ ok: boolean; etiquetas: string[] }>(`/cliente/oportunidades/${id}/etiquetas`, { method: "PUT", body: JSON.stringify({ etiquetas }) });
