import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";

async function cliente(c: PoolClient): Promise<string> {
  const r=await c.query("select nullif(current_setting('app.cliente_id',true),'') cid");
  if(!r.rows[0].cid) throw new ErrorApi("CLIENTE_REQUERIDO","Falta cliente");
  return r.rows[0].cid;
}

/** Canonical E.164, accepts Chilean national mobile/fixed numbers; never guesses
 * a missing digit. A contact number alone is not proof of a citizen's identity. */
export function telefonoVoz(raw: string): string {
  if(typeof raw!=="string" || raw.length>30 || /[^+0-9 ()-]/.test(raw))
    throw new ErrorApi("VALIDACION","Teléfono de contacto inválido");
  let n=raw.replace(/[ ()-]/g,"");
  if(/^[29][0-9]{8}$/.test(n)) n="+56"+n;
  else if(/^56[29][0-9]{8}$/.test(n)) n="+"+n;
  if(!/^\+[1-9][0-9]{7,14}$/.test(n)) throw new ErrorApi("VALIDACION","Teléfono de contacto inválido");
  return n;
}

export interface RespuestaVoz { id: string; texto: string; publicadaEn: string; publica:true; autorTipo:"agente"; }
export interface TicketVoz {
  id: string; numero: string; estado: string; prioridad: string;
  creadoEn: string; primeraRespuestaEn: string|null; primeraRespuestaVence: string|null;
  respuesta: RespuestaVoz|null;
}

async function respuestasPublicas(c: PoolClient,cid: string,id: string): Promise<RespuestaVoz|null> {
  const r=await c.query(
    `select seq::text id,cuerpo texto,creado_en from tickets_mensajes
       where cliente_id=$1 and ticket_id=$2 and autor_tipo='agente' and interno is false
         and length(trim(cuerpo))>0 and cuerpo<>'[contenido suprimido]'
       order by seq desc limit 1`,[cid,id]);
  if(!r.rowCount) return null;
  return {id:r.rows[0].id,texto:r.rows[0].texto,publicadaEn:new Date(r.rows[0].creado_en).toISOString(),publica:true,autorTipo:"agente"};
}

/** Service API: explicit public replies only; no internal notes/AI suggestions.
 * The API key is tenant scoped; the voice adapter must additionally verify the
 * caller's RUT and registered phone before returning this information. */
export async function detalleVoz(c: PoolClient,id: string): Promise<TicketVoz> {
  const cid=await cliente(c);
  const r=await c.query(`select id,numero::text,estado,prioridad,creado_en,primera_respuesta_en,sla_primera_resp_vence
    from tickets where id=$1 and cliente_id=$2 and asunto<>'[suprimido]'`,[id,cid]);
  if(!r.rowCount) throw new ErrorApi("NO_ENCONTRADO","Ticket no encontrado");
  const t=r.rows[0];
  return {id:t.id,numero:t.numero,estado:t.estado,prioridad:t.prioridad,
    creadoEn:new Date(t.creado_en).toISOString(),
    primeraRespuestaEn:t.primera_respuesta_en?new Date(t.primera_respuesta_en).toISOString():null,
    primeraRespuestaVence:t.sla_primera_resp_vence?new Date(t.sla_primera_resp_vence).toISOString():null,
    respuesta:await respuestasPublicas(c,cid,id)};
}

/** RUT + contact binding, not fuzzy search. Missing/wrong identifiers produce
 * the same empty result. Read-only lookup never creates or merges identities. */
export async function consultarPorVoz(c: PoolClient,rut: string,telefono: string): Promise<{datos:TicketVoz[]}> {
  const cid=await cliente(c);const phone=telefonoVoz(telefono);
  const canonical=rut.replace(/[. -]/g,"").toUpperCase();
  if(!/^[1-9][0-9]{5,7}[0-9K]$/.test(canonical)) throw new ErrorApi("VALIDACION","Identificación inválida");
  const r=await c.query(`select t.id from tickets t join nucleo.identidades i
      on i.cliente_id=t.cliente_id and i.persona_id=t.persona_id and i.canal='rut'
      where t.cliente_id=$1 and upper(replace(i.identificador,'-',''))=$2
        and t.telefono_voz=$3 and t.asunto<>'[suprimido]'
      order by t.creado_en desc limit 5`,[cid,canonical,phone]);
  const datos=[];
  for(const row of r.rows) datos.push(await detalleVoz(c,row.id));
  return {datos};
}

export async function fijarContactoVoz(c: PoolClient,id: string,telefono: string,autoriza: boolean): Promise<void> {
  const cid=await cliente(c);const phone=telefonoVoz(telefono);
  const r=await c.query(`update tickets set telefono_voz=$3,autoriza_aviso_voz=$4
     where cliente_id=$1 and id=$2 and asunto<>'[suprimido]'`,[cid,id,phone,autoriza]);
  if(!r.rowCount) throw new ErrorApi("NO_ENCONTRADO","Ticket no encontrado");
}

export function dentroHorarioVoz(now: Date): boolean {
  const hh=new Intl.DateTimeFormat("en-US",{timeZone:"America/Santiago",hour:"2-digit",hourCycle:"h23"}).format(now);
  return +hh>=9 && +hh<19;
}

/** Read-only operational counters. No replies, identities, phones or reserve
 * capabilities are returned. A diagnostic request must never reserve a call. */
export async function diagnosticoAvisosVoz(c:PoolClient,now=new Date(),permitidos?:string[]):Promise<Record<string,unknown>> {
  const cid=await cliente(c);const allowed=permitidos?.map(telefonoVoz)??[];
  const rows=await c.query(`with base as (
    select t.id,t.autoriza_aviso_voz,t.telefono_voz,
      case when length(trim(m.cuerpo))>0 and m.cuerpo<>'[contenido suprimido]' then m.seq end seq,
      a.estado,a.reservado_en,
      exists(select 1 from nucleo.identidades i where i.cliente_id=t.cliente_id
        and i.persona_id=t.persona_id and i.canal='rut') rut_presente,
      exists(select 1 from ticket_avisos_voz b join tickets tb
        on tb.id=b.ticket_id and tb.cliente_id=b.cliente_id
        where b.cliente_id=$1 and tb.telefono_voz=t.telefono_voz and
          (b.reservado_en at time zone 'America/Santiago')::date=
          ($2::timestamptz at time zone 'America/Santiago')::date) limite_hoy
    from tickets t left join lateral (
      select mm.seq,mm.cuerpo from tickets_mensajes mm where mm.cliente_id=t.cliente_id and mm.ticket_id=t.id
        and mm.autor_tipo='agente' and mm.interno is false order by seq desc limit 1) m on true
      left join ticket_avisos_voz a on a.cliente_id=t.cliente_id and a.ticket_id=t.id and a.mensaje_seq=m.seq
    where t.cliente_id=$1 and t.canal_origen='voz_ia' and t.asunto<>'[suprimido]')
    select count(*)::int total,
      count(*) filter(where autoriza_aviso_voz is not true)::int sin_consentimiento,
      count(*) filter(where autoriza_aviso_voz and telefono_voz is null)::int sin_telefono,
      count(*) filter(where autoriza_aviso_voz and seq is null)::int sin_respuesta_publica,
      count(*) filter(where autoriza_aviso_voz and not rut_presente)::int sin_rut,
      count(*) filter(where autoriza_aviso_voz and seq is not null and telefono_voz is not null
        and not(telefono_voz=any($3::text[])))::int fuera_lista_permitida,
      count(*) filter(where estado='reservado')::int reservados,
      count(*) filter(where estado='entregado')::int entregados,
      count(*) filter(where estado in ('fallido','incierto'))::int fallidos_o_inciertos,
      count(*) filter(where autoriza_aviso_voz and telefono_voz=any($3::text[]) and seq is not null
        and (estado is null or estado='cola') and limite_hoy)::int aplazados_limite_diario,
      count(*) filter(where autoriza_aviso_voz and telefono_voz=any($3::text[]) and seq is not null
        and (estado is null or estado='cola') and not limite_hoy and rut_presente)::int elegibles
    from base`,[cid,now,allowed]);
  return {dentroHorario:dentroHorarioVoz(now),limitePorTelefonoDia:1,...rows.rows[0]};
}

/** Scan is deterministic/idempotent; no calls, no external HTTP in this tx. */
export async function prepararAvisosVoz(c: PoolClient): Promise<number> {
  const cid=await cliente(c);
  const r=await c.query(`insert into ticket_avisos_voz(cliente_id,ticket_id,mensaje_seq)
    select t.cliente_id,t.id,m.seq from tickets t
      join lateral (select seq from tickets_mensajes m where m.ticket_id=t.id and m.cliente_id=t.cliente_id
        and m.autor_tipo='agente' and m.interno is false and length(trim(m.cuerpo))>0
        and m.cuerpo<>'[contenido suprimido]' order by seq desc limit 1) m on true
    where t.cliente_id=$1 and t.autoriza_aviso_voz is true and t.telefono_voz is not null
      and t.asunto<>'[suprimido]' on conflict(cliente_id,mensaje_seq) do nothing`,[cid]);
  return r.rowCount??0;
}

/** Reserve once before dialing. No automatic lease expiry/retry: a timeout can
 * mean a real call was placed. Only a new public reply can generate a new job. */
export async function reservarAvisoVoz(c: PoolClient,now=new Date(),permitidos?:string[]): Promise<null|Record<string,unknown>> {
  if(!dentroHorarioVoz(now)) return null;
  const allowed=permitidos?.map(telefonoVoz);
  if(allowed?.length===0) return null;
  const cid=await cliente(c);await prepararAvisosVoz(c);
  const r=await c.query(`select a.id,a.ticket_id,a.mensaje_seq,t.numero::text,t.telefono_voz,
      i.identificador rut,m.cuerpo respuesta from ticket_avisos_voz a
      join tickets t on t.id=a.ticket_id and t.cliente_id=a.cliente_id
      join tickets_mensajes m on m.seq=a.mensaje_seq and m.cliente_id=a.cliente_id
      join nucleo.identidades i on i.persona_id=t.persona_id and i.cliente_id=t.cliente_id and i.canal='rut'
      where a.cliente_id=$1 and a.estado='cola' and t.autoriza_aviso_voz is true
        and ($3::text[] is null or t.telefono_voz=any($3))
        and t.telefono_voz is not null and t.asunto<>'[suprimido]'
        and m.interno is false and m.autor_tipo='agente' and m.cuerpo<>'[contenido suprimido]'
        and not exists(select 1 from ticket_avisos_voz b join tickets tb
          on tb.id=b.ticket_id and tb.cliente_id=b.cliente_id where b.cliente_id=$1
          and tb.telefono_voz=t.telefono_voz and b.reservado_en is not null
          and (b.reservado_en at time zone 'America/Santiago')::date=
            ($2::timestamptz at time zone 'America/Santiago')::date)
        and m.seq=(select max(mm.seq) from tickets_mensajes mm where mm.ticket_id=t.id
          and mm.cliente_id=$1 and mm.autor_tipo='agente' and mm.interno is false)
      order by m.seq limit 1 for update of a skip locked`,[cid,now,allowed??null]);
  if(!r.rowCount) return null;
  const job=r.rows[0];
  const lockKey=`${cid}:${job.telefono_voz}:${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(now)}`;
  const ownership=await c.query('select pg_try_advisory_xact_lock(hashtextextended($1,0)) ok',[lockKey]);
  if(!ownership.rows[0].ok) return null;
  const daily=await c.query(`select 1 from ticket_avisos_voz a join tickets t on t.id=a.ticket_id and t.cliente_id=a.cliente_id
    where a.cliente_id=$1 and t.telefono_voz=$2 and
      (a.reservado_en at time zone 'America/Santiago')::date=($3::timestamptz at time zone 'America/Santiago')::date limit 1`,[cid,job.telefono_voz,now]);
  if(daily.rowCount) return null;
  const lock=await c.query(`update ticket_avisos_voz set estado='reservado',reserva=gen_random_uuid(),reservado_en=$3
    where cliente_id=$1 and id=$2 returning reserva::text`,[cid,job.id,now]);
  return {id:job.id,reserva:lock.rows[0].reserva,ticketId:job.ticket_id,numero:job.numero,
    telefono:job.telefono_voz,rut:job.rut,respuesta:{id:String(job.mensaje_seq),texto:job.respuesta,publica:true,autorTipo:"agente"}};
}

export async function terminarAvisoVoz(c: PoolClient,id: string,reserva: string,estado: "entregado"|"fallido"|"incierto"):Promise<void> {
  const cid=await cliente(c);
  const r=await c.query(`update ticket_avisos_voz set estado=$4,terminado_en=now()
    where cliente_id=$1 and id=$2 and reserva=$3 and estado='reservado'`,[cid,id,reserva,estado]);
  if(!r.rowCount) {
    const previous=await c.query('select estado from ticket_avisos_voz where cliente_id=$1 and id=$2 and reserva=$3',[cid,id,reserva]);
    if(previous.rows[0]?.estado===estado) return;
    throw new ErrorApi("CONFLICTO","Aviso no reservado o ya finalizado");
  }
}

export async function detectarAlertasSla(c: PoolClient):Promise<number> {
  const cid=await cliente(c);
  const r=await c.query(`with candidatos as (
      select t.*,case when sla_modo='corrido' then sla_primera_resp_vence
        else sla_primera_resp_vence+(sla_pausa_acum_seg*interval '1 second') end vence_efectivo
      from tickets t where cliente_id=$1 and primera_respuesta_en is null
        and estado not in ('resuelto','cerrado') and asunto<>'[suprimido]'
        and (sla_modo='corrido' or sla_pausa_desde is null)
        and not exists(select 1 from tickets_mensajes m where m.ticket_id=t.id and m.cliente_id=$1
          and m.autor_tipo='agente' and m.interno is false and length(trim(m.cuerpo))>0))
    insert into ticket_alertas_sla(cliente_id,ticket_id,vence_en)
    select cliente_id,id,vence_efectivo from candidatos where vence_efectivo<now()
      on conflict(cliente_id,ticket_id,tipo) do nothing returning ticket_id`,[cid]);
  for(const row of r.rows) await c.query('update tickets set sla_incumplido=true where id=$1 and cliente_id=$2',[row.ticket_id,cid]);
  return r.rowCount??0;
}

export async function listarAlertasSla(c:PoolClient):Promise<{datos:Record<string,unknown>[]}> {
  const cid=await cliente(c);
  const r=await c.query(`select a.id,t.numero::text,t.id ticket_id,t.prioridad,a.vence_en,a.detectada_en
    from ticket_alertas_sla a join tickets t on t.id=a.ticket_id and t.cliente_id=a.cliente_id
    where a.cliente_id=$1 and t.primera_respuesta_en is null and t.estado not in ('resuelto','cerrado')
      and t.asunto<>'[suprimido]' order by a.vence_en limit 100`,[cid]);
  return {datos:r.rows};
}
