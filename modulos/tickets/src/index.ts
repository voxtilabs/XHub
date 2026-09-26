import type { PoolClient } from "pg";
import { ErrorApi, codificarCursor, decodificarCursor } from "@xhub/core";
import type { DefinicionModulo, NucleoApi } from "@xhub/sdk-modulo";
import { politicaSla, sumarMinutosHabiles } from "./sla.js";
import { type Agente, filtroVisibilidad, permisosDe } from "./roles.js";
import { analizarUrgencia } from "./urgencia.js";
import { resumirConversacionIA } from "@xhub/ia";

export type EstadoTicket = "nuevo" | "abierto" | "pendiente" | "resuelto" | "cerrado";
export type Prioridad = "baja" | "media" | "alta" | "urgente";

const TRANSICIONES: Record<EstadoTicket, EstadoTicket[]> = {
  nuevo: ["abierto", "cerrado"], abierto: ["pendiente", "resuelto", "cerrado"],
  pendiente: ["abierto", "resuelto", "cerrado"], resuelto: ["abierto", "cerrado"], cerrado: ["abierto"],
};
export function puedeTransicionar(de: EstadoTicket, a: EstadoTicket): boolean { return TRANSICIONES[de]?.includes(a) ?? false; }

async function clienteDe(c: PoolClient): Promise<string> {
  const cid = (await c.query("select nullif(current_setting('app.cliente_id', true),'') cid")).rows[0].cid;
  if (!cid) throw new ErrorApi("CLIENTE_REQUERIDO", "Falta el cliente en la sesión");
  return cid;
}

export interface Ticket { id: string; numero: string; persona_id: string; asunto: string; estado: EstadoTicket; prioridad: Prioridad; canal_origen: string | null; asignado_a: string | null; resumen: string | null; }

async function proximoNumero(c: PoolClient, cid: string): Promise<number> {
  const r = await c.query(
    `insert into tickets_correlativo (cliente_id, proximo) values ($1, 2)
       on conflict (cliente_id) do update set proximo = tickets_correlativo.proximo + 1 returning proximo - 1 as n`, [cid]);
  return r.rows[0].n;
}

/**
 * xTickets recibe la NucleoApi: NO importa el núcleo directamente (ADR 0009).
 * La persona y la historia van al núcleo a través de esa cara.
 */
export function crearModuloTickets(nucleo: NucleoApi) {
  return {
    async crearTicket(c: PoolClient, args: { canal: string; identidad: string; asunto: string; prioridad?: Prioridad; canalOrigen?: string; cuerpo?: string; equipoId?: string; categoria?: string; etiquetas?: string[] }): Promise<Ticket> {
      const cid = await clienteDe(c);
      if (!args.asunto.trim()) throw new ErrorApi("VALIDACION", "El asunto es obligatorio");
      const persona = await nucleo.asegurarPersona(c, args.canal, args.identidad);
      const numero = await proximoNumero(c, cid);
      const prioridad = args.prioridad ?? "media";
      // SLA: calcula vencimientos en horario hábil desde ahora
      const pol = await politicaSla(c, prioridad);
      const ahora = new Date();
      const vencePR = pol ? sumarMinutosHabiles(ahora, pol.primeraRespuestaMin) : null;
      const venceRes = pol ? sumarMinutosHabiles(ahora, pol.resolucionMin) : null;
      const r = await c.query(
        `insert into tickets (cliente_id, numero, persona_id, asunto, prioridad, canal_origen, equipo_id, categoria, etiquetas, sla_primera_resp_vence, sla_resolucion_vence)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, numero::text, persona_id, asunto, estado, prioridad, canal_origen, asignado_a, resumen`,
        [cid, numero, persona.id, args.asunto.trim(), prioridad, args.canalOrigen ?? args.canal, args.equipoId ?? null, args.categoria ?? null, args.etiquetas ?? [], vencePR, venceRes]);
      const t = r.rows[0] as Ticket;
      if (args.cuerpo) {
        await c.query("insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, cuerpo) values ($1,$2,'persona',$3)", [cid, t.id, args.cuerpo]);
        const an = analizarUrgencia(args.cuerpo);
        await c.query("update tickets set urgencia_detectada=$2 where id=$1", [t.id, an.urgencia]);
        if (an.urgencia === "alta" && prioridad !== "urgente") {
          await c.query("update tickets set prioridad='urgente' where id=$1", [t.id]);
          t.prioridad = "urgente";   // reflejar el escalado en el objeto devuelto
        }
      }
      await nucleo.registrarInteraccion(c, { personaId: persona.id, tipo: "ticket.creado", moduloOrigen: "tickets", objetoTipo: "ticket", objetoId: t.id, resumen: `Ticket #${numero}: ${args.asunto.slice(0, 60)}` });
      return t;
    },
    async asignarTicket(c: PoolClient, ticketId: string, usuarioId: string): Promise<void> {
      const cid = await clienteDe(c);
      const r = await c.query("update tickets set asignado_a=$2, actualizado_en=now() where id=$1 and cliente_id=$3", [ticketId, usuarioId, cid]);
      if (r.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
    },
    async cambiarEstado(c: PoolClient, ticketId: string, a: EstadoTicket): Promise<Ticket> {
      const cid = await clienteDe(c);
      const cur = await c.query("select estado, persona_id, numero from tickets where id=$1 and cliente_id=$2", [ticketId, cid]);
      if (cur.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Ticket no encontrado");
      const de = cur.rows[0].estado as EstadoTicket;
      if (de !== a && !puedeTransicionar(de, a)) throw new ErrorApi("CONFLICTO", `Transición inválida: ${de} → ${a}`, { de, a });
      const resuelto = a === "resuelto" ? "resuelto_en=now()," : "";
      // SLA pausa: entrar a 'pendiente' congela el reloj; salir lo reanuda sumando lo esperado.
      let slaSql = "";
      if (a === "pendiente" && de !== "pendiente") slaSql = "sla_pausa_desde=now(),";
      else if (de === "pendiente" && a !== "pendiente") slaSql = "sla_pausa_acum_seg = sla_pausa_acum_seg + coalesce(extract(epoch from (now() - sla_pausa_desde))::bigint,0), sla_pausa_desde=null,";
      const r = await c.query(`update tickets set estado=$2, ${resuelto} ${slaSql} actualizado_en=now() where id=$1 returning id, numero::text, persona_id, asunto, estado, prioridad, canal_origen, asignado_a, resumen`, [ticketId, a]);
      await nucleo.registrarInteraccion(c, { personaId: cur.rows[0].persona_id, tipo: "ticket.estado", moduloOrigen: "tickets", objetoTipo: "ticket", objetoId: ticketId, resumen: `Ticket #${cur.rows[0].numero} → ${a}` });
      return r.rows[0] as Ticket;
    },
    async agregarMensaje(c: PoolClient, ticketId: string, args: { autorTipo: "persona" | "agente" | "sistema"; autorId?: string; cuerpo: string; interno?: boolean }): Promise<void> {
      const cid = await clienteDe(c);
      await c.query("insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, autor_id, cuerpo, interno) values ($1,$2,$3,$4,$5,$6)", [cid, ticketId, args.autorTipo, args.autorId ?? null, args.cuerpo, args.interno ?? false]);
    },
    async resumirConversacion(c: PoolClient, ticketId: string, resumen?: string): Promise<string> {
      const cid = await clienteDe(c);
      let texto = resumen;
      if (!texto) {
        const m = await c.query("select autor_tipo, cuerpo from tickets_mensajes where cliente_id=$1 and ticket_id=$2 and interno=false order by seq asc", [cid, ticketId]);
        const n = m.rowCount ?? 0;
        // IA-first (GLM si la llave está configurada), con fallback determinista.
        const ia = n > 0 ? await resumirConversacionIA(m.rows.map((x) => ({ autor: x.autor_tipo, texto: x.cuerpo }))) : null;
        texto = ia ?? (n === 0 ? "Sin mensajes aún." : `${n} mensaje(s). Motivo inicial: ${m.rows[0]?.cuerpo?.slice(0, 120) ?? ""}`);
      }
      await c.query("update tickets set resumen=$2, actualizado_en=now() where id=$1 and cliente_id=$3", [ticketId, texto, cid]);
      return texto;
    },

    /** Primera respuesta de un agente: marca el hito de SLA. */
    async responder(c: PoolClient, ticketId: string, agenteId: string, cuerpo: string): Promise<void> {
      const cid = await clienteDe(c);
      await c.query("insert into tickets_mensajes (cliente_id, ticket_id, autor_tipo, autor_id, cuerpo) values ($1,$2,'agente',$3,$4)", [cid, ticketId, agenteId, cuerpo]);
      await c.query("update tickets set primera_respuesta_en=coalesce(primera_respuesta_en, now()), estado=case when estado='nuevo' then 'abierto' else estado end, actualizado_en=now() where id=$1 and cliente_id=$2", [ticketId, cid]);
    },
    /** Escala el ticket a otro equipo (routing). */
    async escalarAEquipo(c: PoolClient, ticketId: string, equipoId: string): Promise<void> {
      const cid = await clienteDe(c);
      await c.query("update tickets set equipo_id=$2, asignado_a=null, prioridad=case prioridad when 'baja' then 'media' when 'media' then 'alta' else 'urgente' end, actualizado_en=now() where id=$1 and cliente_id=$3", [ticketId, equipoId, cid]);
    },
    /** CSAT: la persona califica 1..5 al resolverse. */
    async calificar(c: PoolClient, ticketId: string, estrellas: number): Promise<void> {
      if (estrellas < 1 || estrellas > 5) throw new ErrorApi("VALIDACION", "La calificación es de 1 a 5");
      const cid = await clienteDe(c);
      await c.query("update tickets set satisfaccion=$2 where id=$1 and cliente_id=$3 and estado in ('resuelto','cerrado')", [ticketId, estrellas, cid]);
    },
    /** Barrido de SLA: marca incumplidos los que pasaron su vencimiento sin resolver. */
    async marcarSlaIncumplido(c: PoolClient): Promise<number> {
      const cid = await clienteDe(c);
      const r = await c.query("update tickets set sla_incumplido=true where cliente_id=$1 and sla_incumplido=false and estado not in ('resuelto','cerrado') and ((sla_primera_resp_vence < now() and primera_respuesta_en is null) or sla_resolucion_vence < now())", [cid]);
      return r.rowCount ?? 0;
    },
    /** Bandeja con VISIBILIDAD por jerarquía del actor (propios/equipo/todo). */
    async bandejaDe(c: PoolClient, actor: Agente, filtro: { estado?: EstadoTicket } = {}, limite = 25) {
      const cid = await clienteDe(c);
      const vis = filtroVisibilidad(actor);
      const cond = ["t.cliente_id=$1"]; const params: unknown[] = [cid];
      let sqlVis = vis.sql;
      for (const pv of vis.params) { params.push(pv); }
      // reemplazar $Q/$R por índices reales
      if (vis.params.length === 2) { sqlVis = sqlVis.replace("$Q", `$${params.length-1}`).replace("$R", `$${params.length}`); }
      else if (vis.params.length === 1) { sqlVis = sqlVis.replace("$R", `$${params.length}`); }
      cond.push(sqlVis);
      if (filtro.estado) { params.push(filtro.estado); cond.push(`t.estado=$${params.length}`); }
      params.push(limite);
      const r = await c.query(`select t.id, t.numero::text, t.persona_id, t.asunto, t.estado, t.prioridad, t.canal_origen, t.asignado_a, t.resumen, t.sla_incumplido from tickets t where ${cond.join(" and ")} order by t.numero desc limit $${params.length}`, params);
      return { datos: r.rows as (Ticket & { sla_incumplido: boolean })[], puede: permisosDe(actor.rol) };
    },
    async listarBandeja(c: PoolClient, filtro: { estado?: EstadoTicket; asignadoA?: string } = {}, cursor?: string, limite = 25) {
      const cid = await clienteDe(c);
      const cond = ["t.cliente_id=$1"]; const params: unknown[] = [cid];
      if (filtro.estado) { params.push(filtro.estado); cond.push(`t.estado=$${params.length}`); }
      if (filtro.asignadoA) { params.push(filtro.asignadoA); cond.push(`t.asignado_a=$${params.length}`); }
      const desde = decodificarCursor(cursor);
      if (desde) { params.push(desde); cond.push(`t.numero < $${params.length}`); }
      params.push(limite + 1);
      const r = await c.query(`select t.id, t.numero::text, t.persona_id, t.asunto, t.estado, t.prioridad, t.canal_origen, t.asignado_a, t.resumen, t.numero as _n from tickets t where ${cond.join(" and ")} order by t.numero desc limit $${params.length}`, params);
      const filas = r.rows as (Ticket & { _n: number })[];
      const hayMas = filas.length > limite;
      const datos = (hayMas ? filas.slice(0, limite) : filas).map(({ _n, ...t }) => t);
      return { datos, siguiente: hayMas ? codificarCursor(filas[limite - 1]._n) : null };
    },
  };
}

export const definicion: DefinicionModulo = {
  manifiesto: { nombre: "tickets", depende: ["nucleo"], permisos: ["tickets.leer", "tickets.crear", "tickets.responder", "tickets.asignar", "tickets.manage"], eventos: ["ticket.creado", "ticket.estado", "ticket.asignado"] },
  migraciones: ["0013_tickets.sql", "0014_tickets_pro.sql", "0015_tickets_auto.sql", "0016_tickets_fusion.sql", "0017_tickets_sla_pausa.sql"],
  rutas: [
    { metodo: "GET", ruta: "/tickets", scope: "tickets.leer" },
    { metodo: "POST", ruta: "/tickets", scope: "tickets.crear" },
    { metodo: "PUT", ruta: "/tickets/:id/estado", scope: "tickets.responder" },
    { metodo: "PUT", ruta: "/tickets/:id/asignar", scope: "tickets.asignar" },
  ],
};

export * from "./reportes.js";

export * from "./automatizacion.js";

export * from "./contexto.js";

export * from "./urgencia.js";
