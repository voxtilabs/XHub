import { conCliente, conPlataforma, auditar } from "@xhub/db";
import { eliminarObjeto, retencionEfectiva } from "@xhub/core";

/**
 * Retención de datos por plan (#105). Por cada cliente calcula los días efectivos
 * (plan = techo, excepción del cliente solo acorta) y purga lo que cae fuera de la
 * ventana. Hoy purga `nucleo.adjuntos` — lo único con BYTE en el almacén y por tanto
 * lo único que puede dejar HUÉRFANOS. La espina (interacciones) es append-only por
 * diseño (su bordado de PII es el derecho del titular, #20), y tickets no tiene grant
 * de delete; por eso no se tocan aquí.
 *
 * Orden exigido por el criterio: recoger llaves ANTES del borrado de filas, y borrar los
 * objetos del almacén DESPUÉS de confirmar (commit) la transacción. Así nunca borramos
 * el objeto sin haber confirmado que la fila se fue, y la lista de llaves garantiza que
 * no quedan archivos huérfanos. Por lotes: cada tanda es su propia transacción corta.
 */
export interface ResumenRetencion {
  clientesEvaluados: number; clientesConPurga: number;
  adjuntosBorrados: number; objetosBorrados: number; objetosFallidos: number;
}

export interface DepsRetencion {
  conCliente: typeof conCliente;
  conPlataforma: typeof conPlataforma;
  auditar: typeof auditar;
  eliminar: (clienteId: string, key: string) => Promise<void>;
}

const depsDefault: DepsRetencion = { conCliente, conPlataforma, auditar, eliminar: eliminarObjeto };
const LOTE = 500; // filas por tanda (transacción corta)

/** Ejecuta una corrida de retención. `dry` solo cuenta lo que borraría, sin tocar nada. */
export async function purgarRetencion(opts: { dry?: boolean } = {}, deps: DepsRetencion = depsDefault): Promise<ResumenRetencion> {
  const dry = !!opts.dry;
  const clientes = await deps.conPlataforma((c) => c.query(
    `select cl.id, cl.retencion_dias as cliente_dias, p.retencion_dias as plan_dias
       from plataforma.clientes cl
       left join plataforma.planes p on p.id = cl.plan_id`));

  let evaluados = 0, conPurga = 0, adj = 0, obj = 0, objFail = 0;

  for (const row of clientes.rows as { id: string; cliente_dias: number | null; plan_dias: number | null }[]) {
    evaluados++;
    const dias = retencionEfectiva(row.plan_dias, row.cliente_dias);
    if (dias == null) continue; // ilimitado: no se purga

    if (dry) {
      const n = Number((await deps.conCliente(row.id, (cc) => cc.query(
        `select count(*)::int n from nucleo.adjuntos where creado_en < now() - ($1 || ' days')::interval`,
        [String(dias)]))).rows[0].n);
      if (n > 0) { conPurga++; adj += n; }
      continue;
    }

    let purgoAlgo = false;
    // Lotes: cada vuelta recoge hasta LOTE llaves, borra esas filas en su propia
    // transacción (commit al volver), y recién entonces borra los objetos del almacén.
    for (;;) {
      const keys = await deps.conCliente(row.id, async (cc) => {
        const sel = await cc.query(
          `select key from nucleo.adjuntos
            where creado_en < now() - ($1 || ' days')::interval
            order by creado_en asc limit $2`, [String(dias), LOTE]);
        const ks = sel.rows.map((r) => r.key as string);
        if (ks.length) await cc.query(`delete from nucleo.adjuntos where key = any($1)`, [ks]);
        return ks;
      });
      if (!keys.length) break;
      purgoAlgo = true; adj += keys.length;
      // Transacción ya confirmada: ahora el almacén. eliminarObjeto es idempotente.
      for (const k of keys) {
        try { await deps.eliminar(row.id, k); obj++; }
        catch { objFail++; }
      }
      if (keys.length < LOTE) break;
    }
    if (purgoAlgo) conPurga++;
  }

  // Auditoría: UNA entrada por corrida (no por cliente ni por fila).
  if (!dry) await deps.auditar({
    actorTipo: "sistema", accion: "retencion.ejecutada", recurso: "plataforma",
    resultado: objFail ? "error" : "ok",
    metadata: { clientesEvaluados: evaluados, clientesConPurga: conPurga, adjuntosBorrados: adj, objetosBorrados: obj, objetosFallidos: objFail },
  }).catch(() => {});

  return { clientesEvaluados: evaluados, clientesConPurga: conPurga, adjuntosBorrados: adj, objetosBorrados: obj, objetosFallidos: objFail };
}
