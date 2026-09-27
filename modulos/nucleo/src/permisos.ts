import type { PoolClient } from "pg";

/**
 * Permisos que el admin de un cliente reparte a SUS usuarios. El admin del cliente
 * los tiene todos por su rol; el usuario ve/hace solo lo que aquí se le concede.
 * Catálogo cerrado: el enforcement programa contra la CLAVE, no contra el texto.
 */
export interface PermisoDef { clave: string; nombre: string; descripcion: string; modulo: string; }
export const CATALOGO_PERMISOS: PermisoDef[] = [
  { clave: "bandeja.ver", nombre: "Ver bandeja", descripcion: "Entra a xTickets y ve los tickets según su visibilidad", modulo: "tickets" },
  { clave: "bandeja.gestionar", nombre: "Gestionar tickets", descripcion: "Asigna, cambia estado y responde tickets", modulo: "tickets" },
  { clave: "ficha360.ver", nombre: "Ver ficha 360", descripcion: "Abre la ficha 360 de una persona (historia omnicanal)", modulo: "nucleo" },
  { clave: "personas.buscar", nombre: "Buscar personas", descripcion: "Busca personas por nombre, teléfono o email", modulo: "nucleo" },
  { clave: "crm.ver", nombre: "Ver oportunidades", descripcion: "Entra a xCRM y ve el embudo de oportunidades", modulo: "crm" },
  { clave: "crm.gestionar", nombre: "Gestionar oportunidades", descripcion: "Crea, mueve de etapa y cierra oportunidades", modulo: "crm" },
];
const CLAVES = new Set(CATALOGO_PERMISOS.map((p) => p.clave));
export const esPermisoValido = (p: string): boolean => CLAVES.has(p);

/** Permisos concedidos a un usuario. */
export async function permisosDe(c: PoolClient, usuarioId: string): Promise<string[]> {
  const r = await c.query("select permiso from plataforma.usuario_permisos where usuario_id=$1 order by permiso", [usuarioId]);
  return r.rows.map((x) => x.permiso as string);
}

/** Reemplaza el set de permisos de un usuario (solo claves del catálogo). */
export async function fijarPermisos(c: PoolClient, usuarioId: string, permisos: string[]): Promise<string[]> {
  const validos = [...new Set(permisos.filter(esPermisoValido))];
  await c.query("delete from plataforma.usuario_permisos where usuario_id=$1", [usuarioId]);
  for (const p of validos)
    await c.query("insert into plataforma.usuario_permisos (usuario_id, permiso) values ($1,$2) on conflict do nothing", [usuarioId, p]);
  return validos;
}

export interface UsuarioRef { id: string; clienteId: string | null; rol: string; }
/** A qué cliente pertenece un usuario y su rol — para acotar acciones cross-cliente. */
export async function usuarioDeCliente(c: PoolClient, usuarioId: string): Promise<UsuarioRef | null> {
  const r = await c.query(`select id, "clienteId", coalesce(rol,'usuario') as rol from "user" where id=$1`, [usuarioId]);
  if (r.rowCount === 0) return null;
  return { id: r.rows[0].id, clienteId: r.rows[0].clienteId, rol: r.rows[0].rol };
}
