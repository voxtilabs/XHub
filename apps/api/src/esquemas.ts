/**
 * Validación de entrada con Zod — la librería estándar de TS (no reinventamos la
 * rueda). Cada ruta parsea su body con su esquema; un body inválido se convierte en
 * un ErrorApi('VALIDACION') con el detalle de Zod, sin llegar a la lógica.
 */
import { z } from "zod";
import { ErrorApi } from "@xhub/core";

export const canalEnum = z.enum(["telefono", "email", "rut", "xcontact", "webchat", "instagram", "messenger"]);
export const prioridadEnum = z.enum(["baja", "media", "alta", "urgente"]);
export const estadoEnum = z.enum(["nuevo", "abierto", "pendiente", "resuelto", "cerrado"]);
export const estadoClienteEnum = z.enum(["en_alta", "activo", "moroso", "solo_lectura", "suspendido"]);

export const crearTicket = z.object({
  canal: canalEnum,
  identidad: z.string().min(1).max(200),
  asunto: z.string().min(1).max(300),
  prioridad: prioridadEnum.optional(),
  canalOrigen: z.string().max(40).optional(),
  cuerpo: z.string().max(5000).optional(),
}).strict();
export const cambiarEstado = z.object({ estado: estadoEnum }).strict();
export const cambiarEstadoCliente = z.object({ estado: estadoClienteEnum }).strict();
export const asignar = z.object({ usuarioId: z.string().uuid() }).strict();
export const crearCliente = z.object({ nombre: z.string().min(2).max(120) }).strict();
export const fijarCuota = z.object({ limiteMensual: z.number().int().min(0).max(100_000_000) }).strict();
export const modulo = z.object({ encendido: z.boolean() }).strict();
export const configTriage = z.object({
  modo: z.enum(["automatico", "sugerir", "manual"]),
  umbral: z.number().min(0).max(1),   // porcentaje 0..1, 100% ajustable
}).strict();
export const crearLlave = z.object({
  nombre: z.string().min(1).max(80),
  scopes: z.array(z.string().max(40)).max(30).optional(),
}).strict();

/** Valida `data` con `schema` de Zod; lanza ErrorApi('VALIDACION') con el detalle. */
export function validar<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => ({ campo: i.path.join(".") || "(raíz)", problema: i.message }));
    throw new ErrorApi("VALIDACION", "Datos de entrada inválidos", { errores: detalle });
  }
  return r.data;
}
