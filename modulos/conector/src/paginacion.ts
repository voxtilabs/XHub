/**
 * Recorrido de listados largos de XContact por KEYSET (#52). Cada elemento se entrega
 * EXACTAMENTE una vez, y si el recorrido se interrumpe a mitad, reanudar desde el
 * último cursor procesado NO reprocesa lo ya visto (no duplica). El cursor es la clave
 * del último elemento entregado; la página siguiente pide "estrictamente después".
 */
export interface OpcionesRecorrido<T> {
  /** Trae una página de a lo sumo `limite` elementos con clave > `despuesDe` (o desde el inicio si null). */
  traer: (despuesDe: string | null, limite: number) => Promise<T[]>;
  /** Clave estable y creciente de un elemento (el cursor). */
  clave: (item: T) => string;
  /** Qué hacer con cada elemento (idempotente aguas abajo por su dedupeId). */
  alProcesar: (item: T) => Promise<void> | void;
  limite?: number;
  /** Cursor desde el que reanudar (null = desde el principio). */
  desde?: string | null;
}

export async function recorrerKeyset<T>(o: OpcionesRecorrido<T>): Promise<{ procesados: number; ultimoCursor: string | null }> {
  const limite = o.limite ?? 100;
  let cursor: string | null = o.desde ?? null;
  let procesados = 0;
  for (;;) {
    const pagina = await o.traer(cursor, limite);
    if (pagina.length === 0) break;
    for (const item of pagina) { await o.alProcesar(item); cursor = o.clave(item); procesados++; }
    if (pagina.length < limite) break; // última página incompleta → terminamos
  }
  return { procesados, ultimoCursor: cursor };
}
