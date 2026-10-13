"use client";
import { Icon } from "@/components/icon";

/**
 * Paginador por HOJAS, compartido por la bandeja y el embudo: elegir cuántos por hoja
 * (20/50/100) y moverse entre hojas. Muestra el rango real ("41–60 de 237") para que
 * se vea que no falta nada: la lista ya no se corta en silencio.
 */
export const TAMANOS_HOJA = [20, 50, 100];

export function Paginador({ pagina, paginas, total, limite, cargando, onPagina, onLimite, etiqueta = "resultados" }: {
  pagina: number; paginas: number; total: number; limite: number; cargando?: boolean;
  onPagina: (p: number) => void; onLimite: (l: number) => void; etiqueta?: string;
}) {
  if (total === 0) return null;
  const desde = (pagina - 1) * limite + 1;
  const hasta = Math.min(total, pagina * limite);
  const btn = "h-8 px-2.5 rounded-md border border-border text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap py-3">
      <span className="text-[12px] text-muted-foreground tabular-nums">
        {desde}–{hasta} de {total} {etiqueta}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[12px] text-muted-foreground flex items-center gap-1.5">
          Por hoja
          <select value={limite} disabled={cargando} onChange={(e) => onLimite(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-background px-1.5 text-[12.5px] text-foreground">
            {TAMANOS_HOJA.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} disabled={cargando || pagina <= 1} onClick={() => onPagina(1)} aria-label="Primera hoja">«</button>
          <button type="button" className={btn} disabled={cargando || pagina <= 1} onClick={() => onPagina(pagina - 1)} aria-label="Hoja anterior"><Icon name="arrow-left" /></button>
          <span className="text-[12.5px] text-muted-foreground tabular-nums px-1">Hoja {pagina} de {paginas}</span>
          <button type="button" className={btn} disabled={cargando || pagina >= paginas} onClick={() => onPagina(pagina + 1)} aria-label="Hoja siguiente"><Icon name="arrow-right" /></button>
          <button type="button" className={btn} disabled={cargando || pagina >= paginas} onClick={() => onPagina(paginas)} aria-label="Última hoja">»</button>
        </div>
      </div>
    </div>
  );
}
