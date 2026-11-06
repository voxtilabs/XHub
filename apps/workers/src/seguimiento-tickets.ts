import { conCliente, conPlataforma } from "@xhub/db";
import { detectarAlertasSla, prepararAvisosVoz } from "@xhub/modulo-tickets";

let proximo=0;
/** Low-frequency, tenant-scoped DB work only. Does not dial or send HTTP. */
export async function tickSeguimientoTickets():Promise<{alertas:number;avisos:number}> {
  if(Date.now()<proximo) return {alertas:0,avisos:0};
  proximo=Date.now()+60000;
  const rows=await conPlataforma(c=>c.query("select cliente_id from plataforma.entitlements where modulo='tickets' and encendido=true"));
  let alertas=0,avisos=0;
  for(const row of rows.rows) {
    const r=await conCliente(row.cliente_id,async c=>({
      alertas:await detectarAlertasSla(c),avisos:await prepararAvisosVoz(c),
    }));
    alertas+=r.alertas;avisos+=r.avisos;
  }
  return {alertas,avisos};
}
