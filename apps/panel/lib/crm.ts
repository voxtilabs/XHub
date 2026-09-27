"use client";
import { apiFetch } from "@/lib/api";
export const ETAPAS = ["Prospecto", "Calificado", "Propuesta", "Negociación", "Cierre"];
export type Oportunidad = { id: string; titulo: string; valor: number; etapa: string; estado: "abierta" | "ganada" | "perdida"; persona_id: string; persona_email: string | null; creado_en: string };
export type Embudo = { datos: Oportunidad[]; etapas: string[]; resumen: { abiertas: number; valorAbierto: number; ganadas: number; valorGanado: number }; puede: { gestionar: boolean } };
export const getOportunidades = () => apiFetch<Embudo>("/cliente/oportunidades");
export const crearOportunidad = (b: { canal: string; identidad: string; titulo: string; valor?: number; etapa?: string }) => apiFetch<Oportunidad>("/cliente/oportunidades", { method: "POST", body: JSON.stringify(b) });
export const moverEtapa = (id: string, etapa: string) => apiFetch(`/cliente/oportunidades/${id}/etapa`, { method: "PUT", body: JSON.stringify({ etapa }) });
export const cerrarOportunidad = (id: string, estado: "ganada" | "perdida") => apiFetch(`/cliente/oportunidades/${id}/cerrar`, { method: "PUT", body: JSON.stringify({ estado }) });
