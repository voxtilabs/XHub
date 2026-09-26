import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";

/** Jerarquía: agente < supervisor < admin. El nivel decide el alcance. */
export type RolTicket = "agente" | "supervisor" | "admin";
const NIVEL: Record<RolTicket, number> = { agente: 1, supervisor: 2, admin: 3 };

/** Permisos por rol. Configurable ampliando este mapa (o por overrides en base). */
export interface PermisosTicket {
  verPropios: boolean; verEquipo: boolean; verTodo: boolean;
  responder: boolean; asignar: boolean; reasignarOtros: boolean;
  configurarSla: boolean; gestionarEquipos: boolean; gestionarAgentes: boolean;
  cerrarAjeno: boolean; verReportes: boolean;
}
export function permisosDe(rol: RolTicket): PermisosTicket {
  const n = NIVEL[rol];
  return {
    verPropios: true,
    verEquipo: n >= 2,
    verTodo: n >= 3,
    responder: true,
    asignar: n >= 1,               // un agente puede tomar tickets
    reasignarOtros: n >= 2,        // reasignar los de otros: supervisor+
    cerrarAjeno: n >= 2,
    configurarSla: n >= 3,
    gestionarEquipos: n >= 3,
    gestionarAgentes: n >= 3,
    verReportes: n >= 2,
  };
}

export interface Agente { usuarioId: string; equipoId: string | null; rol: RolTicket; activo: boolean; }

async function cid(c: PoolClient): Promise<string> {
  const v = (await c.query("select nullif(current_setting('app.cliente_id',true),'') cid")).rows[0].cid;
  if (!v) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return v;
}

export async function crearEquipo(c: PoolClient, nombre: string): Promise<string> {
  const r = await c.query("insert into ticket_equipos (cliente_id, nombre) values ($1,$2) returning id", [await cid(c), nombre]);
  return r.rows[0].id;
}

/** Alta/actualización de un agente con su rol y equipo. Solo un admin puede. */
export async function definirAgente(c: PoolClient, actor: Agente, a: { usuarioId: string; equipoId?: string; rol: RolTicket }): Promise<void> {
  if (!permisosDe(actor.rol).gestionarAgentes) throw new ErrorApi("SIN_PERMISO", "Solo un admin gestiona agentes");
  await c.query(
    `insert into ticket_agentes (cliente_id, usuario_id, equipo_id, rol) values ($1,$2,$3,$4)
       on conflict (cliente_id, usuario_id, coalesce(equipo_id,'00000000-0000-0000-0000-000000000000'::uuid))
       do update set rol=excluded.rol, activo=true`,
    [await cid(c), a.usuarioId, a.equipoId ?? null, a.rol]);
}

export async function agenteDe(c: PoolClient, usuarioId: string): Promise<Agente | null> {
  const r = await c.query("select usuario_id, equipo_id, rol, activo from ticket_agentes where cliente_id=$1 and usuario_id=$2 and activo=true order by case rol when 'admin' then 3 when 'supervisor' then 2 else 1 end desc limit 1", [await cid(c), usuarioId]);
  if (r.rowCount === 0) return null;
  const x = r.rows[0];
  return { usuarioId: x.usuario_id, equipoId: x.equipo_id, rol: x.rol, activo: x.activo };
}

/** Filtro SQL de visibilidad según el rol del actor (propios / equipo / todo). */
export function filtroVisibilidad(actor: Agente): { sql: string; params: unknown[] } {
  const p = permisosDe(actor.rol);
  if (p.verTodo) return { sql: "true", params: [] };
  if (p.verEquipo && actor.equipoId) return { sql: "(t.equipo_id = $Q or t.asignado_a = $R)", params: [actor.equipoId, actor.usuarioId] };
  return { sql: "t.asignado_a = $R", params: [actor.usuarioId] };
}
