import {test,expect,beforeAll,afterAll} from 'vitest';
import {conCliente,conPlataforma,cerrarPool,migrar,cargarDe} from '@xhub/db';
import {crearCliente} from '@xhub/modulo-nucleo';
import {join} from 'node:path';
import {crearModuloTickets,detalleVoz,consultarPorVoz,telefonoVoz,fijarContactoVoz,
  prepararAvisosVoz,reservarAvisoVoz,terminarAvisoVoz,dentroHorarioVoz,detectarAlertasSla,listarAlertasSla,diagnosticoAvisosVoz} from '../src/index.js';
import {nucleoReal} from './nucleo-real.js';
const T=crearModuloTickets(nucleoReal);let A='',B='';
beforeAll(async()=>{
  await migrar(cargarDe(join(__dirname,'../../../packages/db/migrations')));
  A=(await conPlataforma(c=>crearCliente(c,'Voz A'))).id;
  B=(await conPlataforma(c=>crearCliente(c,'Voz B'))).id;
});
afterAll(async()=>{await cerrarPool();});
const phone='+56912345678';
async function ticket(cid:string,suffix:string,consent=false) {
  return conCliente(cid,c=>T.crearTicket(c,{canal:'rut',identidad:'12345678-5',asunto:'QA '+suffix,
    cuerpo:'Solicitud sintética',telefonoContacto:phone,autorizaAvisoVoz:consent,slaPrimeraRespuestaMin:1440,slaModo:'corrido'}));
}
test('canonical phone without guessing or accepting injected text',()=>{
  expect(telefonoVoz('912345678')).toBe(phone);expect(telefonoVoz('+56 9 1234 5678')).toBe(phone);
  for(const x of ['12345678','anonymous','+56912345678\nsecret','sip:912345678','1000'])expect(()=>telefonoVoz(x)).toThrow();
});
test('09 inclusive / 19 exclusive in Chile, not UTC',()=>{
  expect(dentroHorarioVoz(new Date('2026-11-06T12:00:00Z'))).toBe(true);
  expect(dentroHorarioVoz(new Date('2026-11-06T11:59:59Z'))).toBe(false);
  expect(dentroHorarioVoz(new Date('2026-11-06T22:00:00Z'))).toBe(false);
});
test('only public agent reply, never internal, citizen text or AI suggestions',async()=>{
  const t=await ticket(A,'public');
  await conCliente(A,c=>T.agregarMensaje(c,t.id,{autorTipo:'persona',cuerpo:'Mensaje ciudadano'}));
  await conCliente(A,c=>T.agregarMensaje(c,t.id,{autorTipo:'agente',cuerpo:'Respuesta pública autorizada'}));
  await conCliente(A,c=>T.agregarMensaje(c,t.id,{autorTipo:'agente',cuerpo:'NOTA PRIVADA',interno:true}));
  const d=await conCliente(A,c=>detalleVoz(c,t.id));
  expect(d.respuesta?.texto).toBe('Respuesta pública autorizada');expect(d.primeraRespuestaEn).not.toBeNull();
  expect(JSON.stringify(d)).not.toContain('NOTA PRIVADA');expect(JSON.stringify(d)).not.toContain('Mensaje ciudadano');
  await expect(conCliente(B,c=>detalleVoz(c,t.id))).rejects.toMatchObject({codigo:'NO_ENCONTRADO'});
});
test('exact RUT and phone binding, no cross-client ownership',async()=>{
  const t=await ticket(A,'owner');
  const mine=await conCliente(A,c=>consultarPorVoz(c,'12.345.678-5',phone));
  expect(mine.datos.some(x=>x.id===t.id)).toBe(true);
  expect((await conCliente(A,c=>consultarPorVoz(c,'12345678-5','+56999999999'))).datos).toEqual([]);
  expect((await conCliente(B,c=>consultarPorVoz(c,'12345678-5',phone))).datos).toEqual([]);
});
test('no callback without explicit consent and public response',async()=>{
  const t=await ticket(B,'no consent');
  await conCliente(B,c=>T.agregarMensaje(c,t.id,{autorTipo:'agente',cuerpo:'Pública'}));
  expect(await conCliente(B,c=>prepararAvisosVoz(c))).toBe(0);
  await conCliente(B,c=>fijarContactoVoz(c,t.id,phone,true));
  expect(await conCliente(B,c=>prepararAvisosVoz(c))).toBe(1);
  expect(await conCliente(B,c=>prepararAvisosVoz(c))).toBe(0);
  expect(await conCliente(B,c=>reservarAvisoVoz(c,new Date('2026-11-06T23:00:00Z')))).toBeNull();
});
test('concurrent reservation, no repeat after uncertain result, cooldown per phone/day',async()=>{
  const C=(await conPlataforma(c=>crearCliente(c,'Voz callbacks'))).id;
  const first=await ticket(C,'one',true),second=await ticket(C,'two',true);
  for(const t of [first,second])await conCliente(C,c=>T.agregarMensaje(c,t.id,{autorTipo:'agente',cuerpo:'Contestación para el ciudadano'}));
  const when=new Date('2026-11-06T12:00:00Z');
  expect(await conCliente(C,c=>reservarAvisoVoz(c,when,['+56999999999']))).toBeNull();
  expect(await conCliente(C,c=>reservarAvisoVoz(c,when,[]))).toBeNull();
  const attempts=await Promise.all([1,2,3].map(()=>conCliente(C,c=>reservarAvisoVoz(c,when))));
  const reserved=attempts.filter(Boolean);expect(reserved).toHaveLength(1);
  const j=reserved[0]!;
  await conCliente(C,c=>terminarAvisoVoz(c,String(j.id),String(j.reserva),'incierto'));
  await conCliente(C,c=>terminarAvisoVoz(c,String(j.id),String(j.reserva),'incierto'));
  expect(await conCliente(C,c=>reservarAvisoVoz(c,when))).toBeNull();
  await expect(conCliente(B,c=>terminarAvisoVoz(c,String(j.id),String(j.reserva),'entregado'))).rejects.toThrow();
  const next=await conCliente(C,c=>reservarAvisoVoz(c,new Date('2026-11-07T12:00:00Z')));
  expect(next).not.toBeNull();expect(next?.id).not.toBe(j.id);
});
test('revoking consent prevents pending callback',async()=>{
  const C=(await conPlataforma(c=>crearCliente(c,'Voz revocar'))).id;const t=await ticket(C,'revoke',true);
  await conCliente(C,c=>T.agregarMensaje(c,t.id,{autorTipo:'agente',cuerpo:'Pública'}));
  await conCliente(C,c=>prepararAvisosVoz(c));
  await conCliente(C,c=>fijarContactoVoz(c,t.id,phone,false));
  expect(await conCliente(C,c=>reservarAvisoVoz(c,new Date('2026-11-06T12:00:00Z')))).toBeNull();
});
test('diagnostics show blockers without reserving, revealing text or crossing tenant',async()=>{
  const C=(await conPlataforma(c=>crearCliente(c,'Voz diagnóstico'))).id;
  const one=await conCliente(C,c=>T.crearTicket(c,{canal:'rut',identidad:'12345678-5',asunto:'QA DIDECO',
    canalOrigen:'voz_ia',categoria:'DIDECO',telefonoContacto:phone,autorizaAvisoVoz:true}));
  const now=new Date('2026-11-06T12:00:00Z');
  let d=await conCliente(C,c=>diagnosticoAvisosVoz(c,now,[phone]));
  expect(d).toMatchObject({total:1,sin_respuesta_publica:1,elegibles:0});
  await conCliente(C,c=>T.agregarMensaje(c,one.id,{autorTipo:'agente',cuerpo:'SECRETO INTERNO',interno:true}));
  d=await conCliente(C,c=>diagnosticoAvisosVoz(c,now,[phone]));
  expect(d.sin_respuesta_publica).toBe(1);
  await conCliente(C,c=>T.agregarMensaje(c,one.id,{autorTipo:'agente',cuerpo:'Respuesta pública para el vecino'}));
  d=await conCliente(C,c=>diagnosticoAvisosVoz(c,now,[phone]));expect(d.elegibles).toBe(1);
  expect(JSON.stringify(d)).not.toContain('SECRETO');expect(JSON.stringify(d)).not.toContain(phone);
  expect((await conCliente(C,c=>c.query('select count(*)::int n from ticket_avisos_voz'))).rows[0].n).toBe(0);
  const denied=await conCliente(C,c=>diagnosticoAvisosVoz(c,now,['+56999999999']));
  expect(denied.fuera_lista_permitida).toBe(1);expect(denied.elegibles).toBe(0);
  const D=(await conPlataforma(c=>crearCliente(c,'Voz diagnóstico aislado'))).id;
  expect((await conCliente(D,c=>diagnosticoAvisosVoz(c,now,[phone]))).total).toBe(0);
});
test('24 elapsed hours, alert once, public first response stops the alert',async()=>{
  const C=(await conPlataforma(c=>crearCliente(c,'Voz SLA'))).id;const t=await ticket(C,'sla');
  const before=await conCliente(C,c=>detalleVoz(c,t.id));
  expect(new Date(before.primeraRespuestaVence!).getTime()-new Date(before.creadoEn).getTime()).toBeCloseTo(86400000,-2);
  await conCliente(C,c=>c.query("update tickets set sla_primera_resp_vence=now()-interval '1 minute' where id=$1",[t.id]));
  expect(await conCliente(C,c=>detectarAlertasSla(c))).toBe(1);
  expect(await conCliente(C,c=>detectarAlertasSla(c))).toBe(0);
  expect((await conCliente(C,c=>listarAlertasSla(c))).datos).toHaveLength(1);
  await conCliente(C,c=>T.agregarMensaje(c,t.id,{autorTipo:'agente',cuerpo:'Estamos gestionando su solicitud'}));
  expect((await conCliente(C,c=>listarAlertasSla(c))).datos).toHaveLength(0);
});
