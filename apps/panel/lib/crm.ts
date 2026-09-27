"use client";
import { apiFetch } from "@/lib/api";

export type Etapa = { id: string; nombre: string; orden: number; probabilidad: number };
export type Pipeline = { id: string; nombre: string; orden: number; etapas: Etapa[] };
export type Oportunidad = { id: string; titulo: string; valor: number; moneda: string; etapa_id: string | null; estado: "abierta" | "ganada" | "perdida"; persona_id: string; persona_email: string | null; probabilidad: number | null; cierre_esperado: string | null; creado_en: string };
export type Embudo = { datos: Oportunidad[]; etapas: Etapa[]; pipelineId: string; resumen: { abiertas: number; valorAbierto: number; ganadas: number; valorGanado: number }; puede: { gestionar: boolean } };
export type Actividad = { id: string; tipo: string; cuerpo: string; hecho: boolean; autor: string | null; creado_en: string };
export type OportunidadDetalle = Oportunidad & { etapa: string | null; motivo_perdida: string | null; actividades: Actividad[]; puede: { gestionar: boolean } };

export const getPipelines = () => apiFetch<{ datos: Pipeline[] }>("/cliente/crm/pipelines");
export const getOportunidades = (pipeline?: string) => apiFetch<Embudo>(`/cliente/oportunidades${pipeline ? `?pipeline=${pipeline}` : ""}`);
export const getOportunidad = (id: string) => apiFetch<OportunidadDetalle>(`/cliente/oportunidades/${id}`);
export const crearOportunidad = (b: { canal: string; identidad: string; titulo: string; valor?: number; moneda?: string; pipelineId?: string; etapaId?: string; cierreEsperado?: string; probabilidad?: number }) => apiFetch<Oportunidad>("/cliente/oportunidades", { method: "POST", body: JSON.stringify(b) });
export const moverEtapa = (id: string, etapaId: string) => apiFetch(`/cliente/oportunidades/${id}/etapa`, { method: "PUT", body: JSON.stringify({ etapaId }) });
export const cerrarOportunidad = (id: string, estado: "ganada" | "perdida", motivo?: string) => apiFetch(`/cliente/oportunidades/${id}/cerrar`, { method: "PUT", body: JSON.stringify({ estado, motivo }) });
export const agregarActividad = (id: string, tipo: string, cuerpo: string) => apiFetch<Actividad>(`/cliente/oportunidades/${id}/actividades`, { method: "POST", body: JSON.stringify({ tipo, cuerpo }) });
export const marcarHecho = (id: string, aid: string, hecho: boolean) => apiFetch(`/cliente/oportunidades/${id}/actividades/${aid}/hecho`, { method: "PUT", body: JSON.stringify({ hecho }) });
