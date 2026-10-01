import type { PoolClient } from "pg";

/**
 * Catálogo de AUTOMATIZACIONES (reglas de negocio toggleables por cliente). El catálogo
 * de claves vive en código; el estado (encendida/apagada + parámetros) vive por cliente.
 *
 * Dos respaldos posibles por entrada:
 *  - "generica": estado en plataforma.cliente_automatizaciones (sumar una regla nueva de
 *     este tipo NO requiere migración — solo agregar la entrada acá y leer el flag donde toque).
 *  - "triage": la regla ya tiene su config propia (ticket_triage_config); el API la compone.
 *
 * Así el superadmin tiene UNA pantalla de automatizaciones por cliente y el catálogo crece
 * pedido a pedido.
 */
export type RespaldoAutomatizacion = "generica" | "triage";
export interface EntradaCatalogo {
  clave: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  respaldo: RespaldoAutomatizacion;
  porDefecto: boolean;
}

export const CATALOGO_AUTOMATIZACIONES: EntradaCatalogo[] = [
  {
    clave: "voxia.ticket_solo_si_abandonada",
    nombre: "voxia: ticket solo si la conversación fue abandonada",
    descripcion:
      "Las conversaciones ABANDONADAS crean ticket + ficha360; las ATENDIDAS se registran solo en la ficha360 (sin ticket). Útil cuando el abandono es el que necesita seguimiento (regla de la Municipalidad de Temuco).",
    categoria: "Ingesta / voxia",
    respaldo: "triage",
    porDefecto: false,
  },
];

export interface EstadoAutomatizacion { clave: string; activa: boolean; params: Record<string, unknown> }

/** Estado (por cliente) de las automatizaciones de respaldo GENÉRICO. RLS por cliente. */
export async function automatizacionesGenericasDe(c: PoolClient, clienteId: string): Promise<Map<string, EstadoAutomatizacion>> {
  const r = await c.query(
    "select clave, activa, params from plataforma.cliente_automatizaciones where cliente_id=$1", [clienteId]);
  const m = new Map<string, EstadoAutomatizacion>();
  for (const x of r.rows) m.set(x.clave, { clave: x.clave, activa: x.activa, params: x.params ?? {} });
  return m;
}

/** ¿Está activa una automatización genérica para el cliente? (lee por su clave). */
export async function automatizacionActiva(c: PoolClient, clienteId: string, clave: string, porDefecto = false): Promise<boolean> {
  const r = await c.query(
    "select activa from plataforma.cliente_automatizaciones where cliente_id=$1 and clave=$2", [clienteId, clave]);
  if (r.rowCount === 0) return porDefecto;
  return r.rows[0].activa === true;
}

/** Enciende/apaga una automatización genérica (upsert). RLS por cliente. */
export async function fijarAutomatizacionGenerica(c: PoolClient, clienteId: string, clave: string, activa: boolean, params: Record<string, unknown> = {}): Promise<void> {
  await c.query(
    `insert into plataforma.cliente_automatizaciones (cliente_id, clave, activa, params) values ($1,$2,$3,$4)
       on conflict (cliente_id, clave) do update set activa=excluded.activa, params=excluded.params, actualizado_en=now()`,
    [clienteId, clave, activa, JSON.stringify(params)]);
}
