import type { PoolClient } from "pg";
import { permisosDe, type Agente } from "./roles.js";
import { ErrorApi } from "@xhub/core";

/** Métricas del panel de supervisor. Solo con permiso verReportes (supervisor+). */
export interface MetricasTickets {
  abiertos: number; sinAsignar: number; slaIncumplidos: number;
  resueltosHoy: number; csatPromedio: number | null; primeraRespuestaMedianaMin: number | null;
}

export async function metricas(c: PoolClient, actor: Agente): Promise<MetricasTickets> {
  if (!permisosDe(actor.rol).verReportes) throw new ErrorApi("SIN_PERMISO", "Sin permiso para ver reportes");
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  const r = await c.query(`
    select
      count(*) filter (where estado in ('nuevo','abierto','pendiente'))::int as abiertos,
      count(*) filter (where asignado_a is null and estado in ('nuevo','abierto','pendiente'))::int as sin_asignar,
      count(*) filter (where sla_incumplido)::int as sla_incumplidos,
      count(*) filter (where estado='resuelto' and resuelto_en::date = (now() at time zone 'America/Santiago')::date)::int as resueltos_hoy,
      round(avg(satisfaccion) filter (where satisfaccion is not null), 2) as csat,
      percentile_cont(0.5) within group (order by extract(epoch from (primera_respuesta_en - creado_en))/60)
        filter (where primera_respuesta_en is not null) as pr_mediana
    from tickets where cliente_id=$1`, [cid]);
  const x = r.rows[0];
  return {
    abiertos: x.abiertos, sinAsignar: x.sin_asignar, slaIncumplidos: x.sla_incumplidos,
    resueltosHoy: x.resueltos_hoy,
    csatPromedio: x.csat !== null ? Number(x.csat) : null,
    primeraRespuestaMedianaMin: x.pr_mediana !== null ? Math.round(Number(x.pr_mediana)) : null,
  };
}

export interface RendimientoAgente { agenteId: string; asignados: number; resueltos: number; csat: number | null; }

/** Rendimiento por agente. Un supervisor ve su equipo; un admin, todos. */
export async function rendimientoAgentes(c: PoolClient, actor: Agente): Promise<RendimientoAgente[]> {
  const p = permisosDe(actor.rol);
  if (!p.verReportes) throw new ErrorApi("SIN_PERMISO", "Sin permiso para ver reportes");
  const cid = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  const cond: string[] = ["cliente_id=$1", "asignado_a is not null"];
  const params: unknown[] = [cid];
  if (!p.verTodo && actor.equipoId) { params.push(actor.equipoId); cond.push(`equipo_id=$${params.length}`); }
  const r = await c.query(`
    select asignado_a::text as agente,
      count(*)::int as asignados,
      count(*) filter (where estado in ('resuelto','cerrado'))::int as resueltos,
      round(avg(satisfaccion) filter (where satisfaccion is not null),2) as csat
    from tickets where ${cond.join(" and ")}
    group by asignado_a order by resueltos desc`, params);
  return r.rows.map((x) => ({ agenteId: x.agente, asignados: x.asignados, resueltos: x.resueltos, csat: x.csat !== null ? Number(x.csat) : null }));
}
