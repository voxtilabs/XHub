/** Paginación por cursor (keyset). El cursor es opaco: base64 de {seq}. */
export function codificarCursor(seq: number | string): string {
  return Buffer.from(JSON.stringify({ s: String(seq) })).toString("base64url");
}
export function decodificarCursor(cursor?: string): string | null {
  if (!cursor) return null;
  try { return JSON.parse(Buffer.from(cursor, "base64url").toString()).s ?? null; }
  catch { return null; }
}
export interface Pagina<T> { datos: T[]; siguiente: string | null; }
export function armarPagina<T extends { seq: number | string }>(filas: T[], limite: number): Pagina<T> {
  const hayMas = filas.length > limite;
  const datos = hayMas ? filas.slice(0, limite) : filas;
  const siguiente = hayMas ? codificarCursor(datos[datos.length - 1].seq) : null;
  return { datos, siguiente };
}
