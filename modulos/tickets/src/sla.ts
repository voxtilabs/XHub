import type { PoolClient } from "pg";

/** Horario hábil (por defecto L-V 9-18, America/Santiago). Configurable a futuro. */
export interface HorarioHabil { dias: number[]; desde: number; hasta: number; zona: string; }
export const HORARIO_DEFECTO: HorarioHabil = { dias: [1, 2, 3, 4, 5], desde: 9, hasta: 18, zona: "America/Santiago" };

/** Suma `minutos` HÁBILES a una fecha, respetando el horario. Puro y testeable. */
export function sumarMinutosHabiles(desde: Date, minutos: number, h: HorarioHabil = HORARIO_DEFECTO): Date {
  let restante = minutos;
  let cur = new Date(desde.getTime());
  let guard = 0;
  while (restante > 0 && guard++ < 100000) {
    const partes = enZona(cur, h.zona);
    const dia = partes.dow, horaMin = partes.hora * 60 + partes.minuto;
    const iniMin = h.desde * 60, finMin = h.hasta * 60;
    if (!h.dias.includes(dia) || horaMin >= finMin) { cur = siguienteApertura(cur, h); continue; }
    if (horaMin < iniMin) { cur = new Date(cur.getTime() + (iniMin - horaMin) * 60000); continue; }
    const disponibleHoy = finMin - horaMin;
    const usar = Math.min(restante, disponibleHoy);
    cur = new Date(cur.getTime() + usar * 60000);
    restante -= usar;
  }
  return cur;
}

function enZona(f: Date, zona: string): { dow: number; hora: number; minuto: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: zona, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(dtf.formatToParts(f).map((x) => [x.type, x.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[p.weekday], hora: +(p.hour === "24" ? "0" : p.hour), minuto: +p.minute };
}
function siguienteApertura(f: Date, h: HorarioHabil): Date {
  let cur = new Date(f.getTime());
  for (let i = 0; i < 14 * 24 * 60; i += 30) {
    cur = new Date(cur.getTime() + 30 * 60000);
    const p = enZona(cur, h.zona);
    if (h.dias.includes(p.dow) && p.hora === h.desde && p.minuto < 30) return cur;
  }
  return cur;
}

export interface PoliticaSla { primeraRespuestaMin: number; resolucionMin: number; }
export async function politicaSla(c: PoolClient, prioridad: string): Promise<PoliticaSla | null> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  const r = await c.query("select primera_respuesta_min, resolucion_min from ticket_sla where cliente_id=$1 and prioridad=$2", [cid, prioridad]);
  if (r.rowCount === 0) return null;
  return { primeraRespuestaMin: r.rows[0].primera_respuesta_min, resolucionMin: r.rows[0].resolucion_min };
}
export async function definirSla(c: PoolClient, prioridad: string, p: PoliticaSla): Promise<void> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  await c.query(
    `insert into ticket_sla (cliente_id, prioridad, primera_respuesta_min, resolucion_min) values ($1,$2,$3,$4)
       on conflict (cliente_id, prioridad) do update set primera_respuesta_min=excluded.primera_respuesta_min, resolucion_min=excluded.resolucion_min`,
    [cid, prioridad, p.primeraRespuestaMin, p.resolucionMin]);
}
