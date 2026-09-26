import type { PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { ErrorApi } from "@xhub/core";

function hashToken(t: string): string { return createHash("sha256").update(t).digest("hex"); }

export interface AdminCreado { id: string; token: string; }

/** Crea un token de administrador de plataforma. Se muestra UNA vez; solo hash en base. */
export async function crearAdminToken(c: PoolClient, nombre: string): Promise<AdminCreado> {
  const token = "xhadm_" + randomBytes(24).toString("base64url");
  const r = await c.query(
    "insert into plataforma.admin_tokens (nombre, hash, prefijo) values ($1,$2,$3) returning id",
    [nombre, hashToken(token), token.slice(0, 12)]);
  return { id: r.rows[0].id, token };
}

export interface Admin { id: string; nombre: string; }

/** Resuelve un token de admin de plataforma. Es cross-cliente (no fija app.cliente_id). */
export async function resolverAdmin(c: PoolClient, token: string): Promise<Admin> {
  if (!token?.startsWith("xhadm_")) throw new ErrorApi("NO_AUTENTICADO", "Token de administrador inválido");
  const r = await c.query(
    "select id, nombre from plataforma.admin_tokens where hash=$1 and revocado_en is null", [hashToken(token)]);
  if (r.rowCount === 0) throw new ErrorApi("NO_AUTENTICADO", "Token de administrador inválido o revocado");
  await c.query("update plataforma.admin_tokens set ultimo_uso=now() where id=$1", [r.rows[0].id]);
  return { id: r.rows[0].id, nombre: r.rows[0].nombre };
}

/** Fija el tope mensual de API de un cliente (override del superadmin). */
export async function fijarCuota(c: PoolClient, clienteId: string, limiteMensual: number): Promise<void> {
  await c.query(
    `insert into plataforma.cuota_override (cliente_id, limite_mensual) values ($1,$2)
       on conflict (cliente_id) do update set limite_mensual=excluded.limite_mensual, fijado_en=now()`,
    [clienteId, limiteMensual]);
}

/** Cuota efectiva de un cliente: override si existe, o el default del plan. */
export async function cuotaDe(c: PoolClient, clienteId: string, porDefecto = 50000): Promise<number> {
  const r = await c.query("select limite_mensual from plataforma.cuota_override where cliente_id=$1", [clienteId]);
  return r.rowCount ? Number(r.rows[0].limite_mensual) : porDefecto;
}

/** Tope de usuarios que la plataforma le concede al cliente (override del superadmin). */
export async function fijarLimiteUsuarios(c: PoolClient, clienteId: string, limite: number): Promise<void> {
  await c.query(
    `insert into plataforma.limite_usuarios (cliente_id, limite) values ($1,$2)
       on conflict (cliente_id) do update set limite=excluded.limite, fijado_en=now()`,
    [clienteId, limite]);
}

/** Límite efectivo de usuarios: override si existe, o el default del plan. */
export async function limiteUsuariosDe(c: PoolClient, clienteId: string, porDefecto = 5): Promise<number> {
  const r = await c.query("select limite from plataforma.limite_usuarios where cliente_id=$1", [clienteId]);
  return r.rowCount ? Number(r.rows[0].limite) : porDefecto;
}

export interface UsuarioCliente { id: string; email: string; nombre: string; rol: string; creadoEn: string; }

/** Usuarios (admins/usuarios) asociados a un cliente. Lee la tabla de Better Auth. */
export async function listarUsuariosCliente(c: PoolClient, clienteId: string): Promise<UsuarioCliente[]> {
  const r = await c.query(
    `select id, email, coalesce(name,'') as nombre, coalesce(rol,'usuario') as rol, "createdAt"
       from "user" where "clienteId"=$1 order by "createdAt"`, [clienteId]);
  return r.rows.map((x) => ({ id: x.id, email: x.email, nombre: x.nombre, rol: x.rol, creadoEn: x.createdAt }));
}

/** Cuántos usuarios tiene ya el cliente (para hacer respetar el tope). */
export async function contarUsuariosCliente(c: PoolClient, clienteId: string): Promise<number> {
  const r = await c.query(`select count(*)::int as n from "user" where "clienteId"=$1`, [clienteId]);
  return r.rows[0].n as number;
}

export interface ClienteAdmin { id: string; nombre: string; estado: string; modulos: string[]; }

/** Lista de clientes para el superadmin, con sus módulos encendidos. */
export async function listarClientesAdmin(c: PoolClient): Promise<ClienteAdmin[]> {
  const r = await c.query(`
    select cl.id, cl.nombre, cl.estado,
      coalesce(array_agg(e.modulo) filter (where e.encendido), '{}') as modulos
    from plataforma.clientes cl
    left join plataforma.entitlements e on e.cliente_id=cl.id and e.encendido=true
    group by cl.id, cl.nombre, cl.estado order by cl.creado_en desc`);
  return r.rows.map((x) => ({ id: x.id, nombre: x.nombre, estado: x.estado, modulos: x.modulos }));
}
