import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { enlazar } from "./enlaces.js";
import { registrarInteraccion } from "./interacciones.js";
import { entitlementsDe } from "./entitlements.js";

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

export interface Regla {
  id: string; nombre: string; evento: string;
  condicion: Record<string, unknown>; accion: Record<string, unknown>;
  moduloDestino?: string; activa: boolean;
}

/** Crea una regla. Nace APAGADA. */
export async function crearRegla(c: PoolClient, r: Omit<Regla, "id" | "activa">): Promise<string> {
  const cid = await clienteDe(c);
  const res = await c.query(
    `insert into nucleo.reglas (cliente_id, nombre, evento, condicion, accion, modulo_destino, activa)
       values ($1,$2,$3,$4,$5,$6,false) returning id`,
    [cid, r.nombre, r.evento, JSON.stringify(r.condicion), JSON.stringify(r.accion), r.moduloDestino ?? null]);
  return res.rows[0].id;
}

export async function activarRegla(c: PoolClient, id: string, activa: boolean): Promise<void> {
  await c.query("update nucleo.reglas set activa=$2 where id=$1", [id, activa]);
}

export interface EventoRegla { tipo: string; objetoId: string; personaId?: string; datos?: Record<string, unknown>; }

export type ResultadoRegla = "ok" | "skip" | "pausada" | "ya_ejecutada" | "error";

/**
 * Aplica las reglas activas que coinciden con un evento. Idempotente por
 * (regla, objeto). Si el módulo destino está apagado, la regla queda PAUSADA
 * con aviso (no falla). 3 fallos sobre el mismo objeto la detienen para ese objeto.
 */
export async function aplicarReglas(c: PoolClient, ev: EventoRegla): Promise<{ reglaId: string; resultado: ResultadoRegla }[]> {
  const cid = await clienteDe(c);
  const entitlements = await entitlementsDe(c, cid);
  const reglas = await c.query(
    "select id, nombre, evento, condicion, accion, modulo_destino, activa from nucleo.reglas where cliente_id=$1 and evento=$2 and activa=true",
    [cid, ev.tipo]);
  const out: { reglaId: string; resultado: ResultadoRegla }[] = [];

  for (const r of reglas.rows) {
    // idempotencia: ¿ya se ejecutó para este objeto?
    const prev = await c.query("select resultado, intentos from nucleo.regla_ejecuciones where regla_id=$1 and objeto_id=$2", [r.id, ev.objetoId]);
    if (prev.rowCount && prev.rows[0].resultado === "ok") { out.push({ reglaId: r.id, resultado: "ya_ejecutada" }); continue; }
    if (prev.rowCount && prev.rows[0].intentos >= 3 && prev.rows[0].resultado === "error") { out.push({ reglaId: r.id, resultado: "error" }); continue; }

    // módulo destino apagado → PAUSADA con aviso, no falla
    if (r.modulo_destino && !entitlements.has(r.modulo_destino)) {
      await registrarEjecucion(c, r.id, ev.objetoId, "skip");
      out.push({ reglaId: r.id, resultado: "pausada" });
      continue;
    }

    try {
      await ejecutarAccion(c, r.accion, ev);
      await registrarEjecucion(c, r.id, ev.objetoId, "ok");
      out.push({ reglaId: r.id, resultado: "ok" });
    } catch {
      await registrarEjecucion(c, r.id, ev.objetoId, "error");
      out.push({ reglaId: r.id, resultado: "error" });
    }
  }
  return out;
}

async function registrarEjecucion(c: PoolClient, reglaId: string, objetoId: string, resultado: string): Promise<void> {
  await c.query(
    `insert into nucleo.regla_ejecuciones (regla_id, objeto_id, resultado) values ($1,$2,$3)
       on conflict (regla_id, objeto_id) do update set resultado=excluded.resultado, intentos=nucleo.regla_ejecuciones.intentos+1, ejecutada_en=now()`,
    [reglaId, objetoId, resultado]);
}

/** Ejecuta la acción declarativa. Extensible por tipo. */
async function ejecutarAccion(c: PoolClient, accion: Record<string, unknown>, ev: EventoRegla): Promise<void> {
  const tipo = accion.tipo as string;
  if (tipo === "enlazar_a_oportunidad") {
    // el ticket "queda en el CRM": se enlaza a una oportunidad (creada por el módulo crm)
    const oportunidadId = accion.oportunidadId as string ?? `op-${ev.objetoId}`;
    await enlazar(c, "ticket", ev.objetoId, "genera", "oportunidad", oportunidadId);
    if (ev.personaId)
      await registrarInteraccion(c, { personaId: ev.personaId, tipo: "regla.enlace", moduloOrigen: "reglas",
        objetoTipo: "oportunidad", objetoId: oportunidadId, resumen: "Ticket registrado en el CRM por regla" });
  } else if (tipo === "registrar_nota") {
    if (ev.personaId)
      await registrarInteraccion(c, { personaId: ev.personaId, tipo: "regla.nota", moduloOrigen: "reglas",
        resumen: (accion.texto as string) ?? "Nota por regla" });
  } else {
    throw new ErrorApi("VALIDACION", `Acción desconocida: ${tipo}`);
  }
}

/** Vista previa: a cuántos objetos afectaría la regla con los datos de hoy (aquí, cuántos aún no ejecutados). */
export async function aQuienAfectaria(c: PoolClient, reglaId: string, objetosCandidatos: string[]): Promise<number> {
  if (objetosCandidatos.length === 0) return 0;
  const ya = await c.query(
    "select objeto_id from nucleo.regla_ejecuciones where regla_id=$1 and objeto_id = any($2) and resultado='ok'",
    [reglaId, objetosCandidatos]);
  const hechos = new Set(ya.rows.map((x) => x.objeto_id));
  return objetosCandidatos.filter((o) => !hechos.has(o)).length;
}
