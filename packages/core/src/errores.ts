/**
 * Errores de la API con CÓDIGO ESTABLE y voz propia. El filtro nunca deja pasar
 * el mensaje crudo del framework (leyes: forma única de error). Un integrador
 * programa contra el `codigo`, no contra el texto.
 */
export type CodigoError =
  | "NO_AUTENTICADO" | "SIN_PERMISO" | "CLIENTE_REQUERIDO" | "NO_ES_MIEMBRO"
  | "NO_ENCONTRADO" | "VALIDACION" | "CONFLICTO" | "CUOTA_EXCEDIDA"
  | "PROVEEDOR_DEGRADADO" | "INTERNO";

const HTTP: Record<CodigoError, number> = {
  NO_AUTENTICADO: 401, SIN_PERMISO: 403, CLIENTE_REQUERIDO: 400, NO_ES_MIEMBRO: 403,
  NO_ENCONTRADO: 404, VALIDACION: 422, CONFLICTO: 409, CUOTA_EXCEDIDA: 429,
  PROVEEDOR_DEGRADADO: 503, INTERNO: 500,
};

export class ErrorApi extends Error {
  constructor(
    public codigo: CodigoError,
    mensaje: string,
    public detalle?: Record<string, unknown>,
  ) { super(mensaje); this.name = "ErrorApi"; }
  get http(): number { return HTTP[this.codigo]; }
}

export interface CuerpoError {
  error: { codigo: CodigoError; mensaje: string; detalle?: Record<string, unknown>; request_id?: string };
}

/** Convierte cualquier error en el cuerpo único. Nunca filtra internals. */
export function aCuerpo(e: unknown, requestId?: string): { http: number; cuerpo: CuerpoError } {
  if (e instanceof ErrorApi)
    return { http: e.http, cuerpo: { error: { codigo: e.codigo, mensaje: e.message, detalle: e.detalle, request_id: requestId } } };
  // cualquier otra cosa: 500 con voz propia, SIN el mensaje crudo
  return { http: 500, cuerpo: { error: { codigo: "INTERNO", mensaje: "Algo salió mal de nuestro lado.", request_id: requestId } } };
}
