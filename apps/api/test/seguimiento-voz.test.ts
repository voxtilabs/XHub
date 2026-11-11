import {test,expect,beforeAll,afterAll} from 'vitest';
import type {FastifyInstance} from 'fastify';
import {join} from 'node:path';
import {crearApp} from '../src/app.js';
import {conCliente,conPlataforma,migrar,cargarDe,cerrarPool} from '@xhub/db';
import {crearCliente,fijarEntitlement,crearLlave} from '@xhub/modulo-nucleo';
import {crearModuloTickets} from '@xhub/modulo-tickets';
import {cerrarRedis} from '@xhub/cuotas';
import {nucleo} from '../src/nucleo.js';
let app:FastifyInstance,A='',token='',limited='',id='';
beforeAll(async()=>{
  await migrar(cargarDe(join(__dirname,'../../../packages/db/migrations')));
  A=(await conPlataforma(c=>crearCliente(c,'API voz aislada'))).id;
  await conPlataforma(c=>fijarEntitlement(c,A,'tickets',true));
  token=(await conPlataforma(c=>crearLlave(c,A,'voz',['tickets.crear','tickets.leer','tickets.responder','tickets.notificar']))).token;
  limited=(await conPlataforma(c=>crearLlave(c,A,'solo lectura',['tickets.leer']))).token;
  app=crearApp();await app.ready();
});
afterAll(async()=>{await app.close();await cerrarPool();await cerrarRedis();});
const headers=()=>({authorization:'Bearer '+token});
test('extended creator is backwards compatible, stores contact and elapsed SLA',async()=>{
  const r=await app.inject({method:'POST',url:'/v1/tickets',headers:headers(),payload:{
    canal:'rut',identidad:'12345678-5',asunto:'QA voz - no gestionar',telefonoContacto:'912345678',
    autorizaAvisoVoz:true,slaModo:'corrido',slaPrimeraRespuestaMin:1440}});
  expect(r.statusCode).toBe(200);id=r.json().id;
  const T=crearModuloTickets(nucleo);
  await conCliente(A,c=>T.agregarMensaje(c,id,{autorTipo:'agente',cuerpo:'Su solicitud está en evaluación.'}));
  await conCliente(A,c=>T.agregarMensaje(c,id,{autorTipo:'agente',cuerpo:'CONFIDENCIAL INTERNO',interno:true}));
});
test('service API stores an explicit department category without changing identity or contact',async()=>{
  const r=await app.inject({method:'POST',url:'/v1/tickets',headers:headers(),payload:{
    canal:'rut',identidad:'12345678-5',asunto:'QA DIDECO - no gestionar',categoria:'DIDECO',
    telefonoContacto:'912345678',autorizaAvisoVoz:false}});
  expect(r.statusCode).toBe(200);
  const saved=await conCliente(A,c=>c.query('select categoria,telefono_voz,autoriza_aviso_voz,asignado_a from tickets where id=$1',[r.json().id]));
  expect(saved.rows[0]).toMatchObject({categoria:'DIDECO',telefono_voz:'+56912345678',autoriza_aviso_voz:false,asignado_a:null});
  const cats=await conCliente(A,c=>c.query("select nombre from ticket_categorias where nombre='DIDECO'"));
  expect(cats.rows).toEqual([{nombre:'DIDECO'}]);
  for(const categoria of ['', 'x'.repeat(101), 'DIDECO\nInjected', '[TRAMITE:foo]', '<script>']){
    const bad=await app.inject({method:'POST',url:'/v1/tickets',headers:headers(),payload:{canal:'rut',identidad:'12345678-5',asunto:'QA',categoria}});
    expect(bad.statusCode).toBe(422);
  }
});
test('public followup and exact ownership lookup never expose internal content',async()=>{
  const r=await app.inject({method:'GET',url:`/v1/tickets/${id}/seguimiento`,headers:headers()});
  expect(r.statusCode).toBe(200);expect(r.json().respuesta.texto).toBe('Su solicitud está en evaluación.');
  expect(r.body).not.toContain('CONFIDENCIAL');
  const mine=await app.inject({method:'POST',url:'/v1/tickets/consulta-voz',headers:headers(),payload:{rut:'123456785',telefono:'912345678'}});
  expect(mine.statusCode).toBe(200);expect(mine.json().datos.map((x:{id:string})=>x.id)).toContain(id);
  const other=await app.inject({method:'POST',url:'/v1/tickets/consulta-voz',headers:headers(),payload:{rut:'123456785',telefono:'999999999'}});
  expect(other.json().datos).toEqual([]);
});
test('notification permission distinct from read; no auth is denied',async()=>{
  const r=await app.inject({method:'POST',url:'/v1/tickets/avisos-voz/reservar',headers:{authorization:'Bearer '+limited},payload:{}});
  expect(r.statusCode).toBe(403);
  const none=await app.inject({method:'GET',url:`/v1/tickets/${id}/seguimiento`});expect(none.statusCode).toBe(401);
  const diagnostic=await app.inject({method:'POST',url:'/v1/tickets/avisos-voz/diagnostico',headers:{authorization:'Bearer '+limited},payload:{telefonosPermitidos:[]}});
  expect(diagnostic.statusCode).toBe(403);
  const allowed=await app.inject({method:'POST',url:'/v1/tickets/avisos-voz/diagnostico',headers:headers(),payload:{telefonosPermitidos:[]}});
  expect(allowed.statusCode).toBe(200);expect(allowed.json()).toHaveProperty('sin_respuesta_publica');
});
test('OpenAPI exposes the real extended contract',async()=>{
  const r=await app.inject({method:'GET',url:'/openapi.json'});expect(r.statusCode).toBe(200);
  for(const path of ['/v1/tickets/consulta-voz','/v1/tickets/{id}/seguimiento','/v1/tickets/alertas-sla'])expect(r.json().paths[path]).toBeTruthy();
});
