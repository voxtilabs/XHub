import type { PoolClient } from "pg";
import { contextoIADe } from "./superadmin.js";

/**
 * Contexto de IA del cliente, MÁS RICO que el system prompt. Reúne tres capas y las
 * antepone a los prompts de resumen/sugerencia:
 *   1) ia_contexto (el system prompt libre de siempre),
 *   2) datos estructurados del negocio (etiqueta → valor),
 *   3) ejemplos few-shot (entrada → respuesta ideal), filtrados por ámbito.
 * Todo es config del cliente, acotada por cliente_id.
 */
export type AmbitoEjemplo = "resumen" | "respuesta" | "todos";
export interface DatoIA { id?: string; etiqueta: string; valor: string }
export interface EjemploIA { id?: string; entrada: string; salida: string; ambito: AmbitoEjemplo }

export async function datosIADe(c: PoolClient, clienteId: string): Promise<DatoIA[]> {
  const r = await c.query("select id, etiqueta, valor from plataforma.ia_datos where cliente_id=$1 order by orden asc, creado_en asc", [clienteId]);
  return r.rows as DatoIA[];
}
export async function ejemplosIADe(c: PoolClient, clienteId: string): Promise<EjemploIA[]> {
  const r = await c.query("select id, entrada, salida, ambito from plataforma.ia_ejemplos where cliente_id=$1 order by orden asc, creado_en asc", [clienteId]);
  return r.rows as EjemploIA[];
}

/** Reemplaza TODOS los datos estructurados del cliente (lista corta, upsert por reemplazo). */
export async function fijarDatosIA(c: PoolClient, clienteId: string, datos: DatoIA[]): Promise<void> {
  const limpio = (datos ?? []).filter((d) => d?.etiqueta?.trim() && d?.valor?.trim()).slice(0, 50);
  await c.query("delete from plataforma.ia_datos where cliente_id=$1", [clienteId]);
  for (let i = 0; i < limpio.length; i++)
    await c.query("insert into plataforma.ia_datos (cliente_id, etiqueta, valor, orden) values ($1,$2,$3,$4)",
      [clienteId, limpio[i].etiqueta.trim().slice(0, 120), limpio[i].valor.trim().slice(0, 600), i]);
}
export async function fijarEjemplosIA(c: PoolClient, clienteId: string, ejemplos: EjemploIA[]): Promise<void> {
  const ok: AmbitoEjemplo[] = ["resumen", "respuesta", "todos"];
  const limpio = (ejemplos ?? []).filter((e) => e?.entrada?.trim() && e?.salida?.trim()).slice(0, 50);
  await c.query("delete from plataforma.ia_ejemplos where cliente_id=$1", [clienteId]);
  for (let i = 0; i < limpio.length; i++)
    await c.query("insert into plataforma.ia_ejemplos (cliente_id, entrada, salida, ambito, orden) values ($1,$2,$3,$4,$5)",
      [clienteId, limpio[i].entrada.trim().slice(0, 1000), limpio[i].salida.trim().slice(0, 1000),
       ok.includes(limpio[i].ambito) ? limpio[i].ambito : "todos", i]);
}

/**
 * Ensambla el contexto completo (system prompt + datos + ejemplos del ámbito) en un solo
 * bloque de texto para pasar a la IA. Devuelve null si no hay nada configurado.
 * `ambito` = la tarea: "resumen" o "respuesta"; incluye además los ejemplos "todos".
 */
export async function contextoIACompleto(c: PoolClient, clienteId: string, ambito: "resumen" | "respuesta"): Promise<string | null> {
  const [base, datos, ejemplos] = await Promise.all([
    contextoIADe(c, clienteId),
    datosIADe(c, clienteId),
    ejemplosIADe(c, clienteId),
  ]);
  const partes: string[] = [];
  if (base?.trim()) partes.push(base.trim());
  if (datos.length) partes.push("Datos del negocio:\n" + datos.map((d) => `- ${d.etiqueta}: ${d.valor}`).join("\n"));
  const ej = ejemplos.filter((e) => e.ambito === ambito || e.ambito === "todos");
  if (ej.length) partes.push("Ejemplos de referencia (imita el tono y la forma, no el contenido literal):\n" +
    ej.map((e, i) => `Ejemplo ${i + 1}:\n  Entrada: ${e.entrada}\n  Respuesta ideal: ${e.salida}`).join("\n"));
  return partes.length ? partes.join("\n\n") : null;
}
