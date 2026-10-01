import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { clasificarPorReglas, decidir, fijarConfigTriage, configTriage } from "../src/triage.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Triage SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("clasificación determinista: un problema necesita ticket; una consulta no", () => {
  const problema = clasificarPorReglas([{ autor: "cliente", texto: "Mi pedido no llega hace 5 días, quiero un reclamo" }]);
  expect(problema.necesitaTicket).toBe(true);
  expect(problema.confianza).toBeGreaterThanOrEqual(0.7);
  const consulta = clasificarPorReglas([{ autor: "cliente", texto: "Hola, ¿a qué hora abren hoy?" }]);
  expect(consulta.necesitaTicket).toBe(false);
  const cierre = clasificarPorReglas([{ autor: "cliente", texto: "Perfecto, gracias, era eso nada más" }]);
  expect(cierre.necesitaTicket).toBe(false);
});

test("EL UMBRAL ES 100% AJUSTABLE: el mismo caso cambia de decisión según el %", () => {
  const ev = { necesitaTicket: true, confianza: 0.6, categoria: "x", prioridad: "media" as const, motivo: "", fuente: "reglas" as const };
  // cliente exigente (umbral 40%): crea
  expect(decidir(ev, { modo: "automatico", umbral: 0.4 })).toBe("creado");
  // cliente que quiere la cola limpia (umbral 85%): descarta el mismo caso
  expect(decidir(ev, { modo: "automatico", umbral: 0.85 })).toBe("descartado");
});

test("los tres modos por cliente: automatico crea, sugerir marca, manual nunca", () => {
  const ev = { necesitaTicket: true, confianza: 0.9, categoria: "x", prioridad: "media" as const, motivo: "", fuente: "reglas" as const };
  expect(decidir(ev, { modo: "automatico", umbral: 0.7 })).toBe("creado");
  expect(decidir(ev, { modo: "sugerir", umbral: 0.7 })).toBe("sugerido");
  expect(decidir(ev, { modo: "manual", umbral: 0.7 })).toBe("descartado");
});

test("config por cliente se guarda y se lee (default sensato: sugerir 70%)", async () => {
  const def = await conCliente(A, (c) => configTriage(c, A));
  expect(def.modo).toBe("sugerir");
  expect(def.umbral).toBe(0.7);
  await conCliente(A, (c) => fijarConfigTriage(c, A, { modo: "automatico", umbral: 0.5 }));
  const nueva = await conCliente(A, (c) => configTriage(c, A));
  expect(nueva.modo).toBe("automatico");
  expect(nueva.umbral).toBe(0.5);
});

test("FLUJO: no todo contacto crea ticket — una consulta se descarta, un problema se crea", async () => {
  await conCliente(A, (c) => fijarConfigTriage(c, A, { modo: "automatico", umbral: 0.7 }));
  // una consulta simple → descartada, NO crea ticket
  const consulta = await conCliente(A, (c) => T.triarConversacion(c, {
    canal: "telefono", identidad: "+56911111111", dedupeId: "conv-1",
    mensajes: [{ autor: "cliente", texto: "Hola, ¿cuánto cuesta el despacho?" }, { autor: "agente", texto: "$3.990" }, { autor: "cliente", texto: "gracias" }] }));
  expect(consulta.accion).toBe("descartado");
  expect(consulta.ticket).toBeUndefined();
  // un problema → crea ticket
  const problema = await conCliente(A, (c) => T.triarConversacion(c, {
    canal: "telefono", identidad: "+56922222222", dedupeId: "conv-2",
    mensajes: [{ autor: "cliente", texto: "Mi pedido no llega y quiero un reclamo formal" }] }));
  expect(problema.accion).toBe("creado");
  expect(problema.ticket).toBeDefined();
});

test("idempotente: reprocesar la misma conversación no crea otro ticket", async () => {
  await conCliente(A, (c) => fijarConfigTriage(c, A, { modo: "automatico", umbral: 0.7 }));
  const args = { canal: "telefono", identidad: "+56933333333", dedupeId: "conv-3",
    mensajes: [{ autor: "cliente", texto: "Hay un cobro duplicado, es un problema" }] };
  const r1 = await conCliente(A, (c) => T.triarConversacion(c, args));
  const r2 = await conCliente(A, (c) => T.triarConversacion(c, args));
  expect(r1.accion).toBe("creado");
  expect(r2.accion).toBe("creado"); // devuelve la decisión previa, no crea otro
  const n = await conCliente(A, (c) => c.query("select count(*)::int n from ticket_triage_log where dedupe_id='conv-3'")) as { rows: { n: number }[] };
  expect(n.rows[0].n).toBe(1);
});

test("regla voxia: ABANDONADA → ticket + ficha360; ATENDIDA → solo ficha360 (sin ticket)", async () => {
  await conCliente(A, (c) => fijarConfigTriage(c, A, { modo: "automatico", umbral: 0.5, ticketSoloSiAbandonada: true }));
  const msgs = [{ autor: "cliente", texto: "Mi pedido no llega hace 5 días, quiero un reclamo urgente" }];
  const inter = (tel: string, tipo: string) => conCliente(A, async (c) => (await c.query(
    "select count(*)::int n from nucleo.interacciones i join nucleo.identidades d on d.persona_id=i.persona_id where d.identificador=$1 and i.tipo=$2", [tel, tipo])).rows[0].n);

  // Teléfonos ÚNICOS de este test (otros tests del archivo usan +569{1,2,3}… → evitar contaminación).
  // Abandonada → ticket creado Y registrado en la ficha360.
  const rAb = await conCliente(A, (c) => T.triarConversacion(c, { canal: "telefono", identidad: "+56951111111", dedupeId: "conv-ab-1", mensajes: msgs, abandonada: true }));
  expect(rAb.accion).toBe("creado");
  expect(rAb.ticket).toBeTruthy();
  expect(await inter("+56951111111", "ticket.creado")).toBeGreaterThanOrEqual(1);

  // Atendida (no abandonada) → NO ticket, pero SÍ queda en la ficha360.
  const rNo = await conCliente(A, (c) => T.triarConversacion(c, { canal: "telefono", identidad: "+56952222222", dedupeId: "conv-no-1", mensajes: msgs, abandonada: false }));
  expect(rNo.accion).toBe("descartado");
  expect(rNo.ticket).toBeFalsy();
  expect(await inter("+56952222222", "conversacion.atendida")).toBeGreaterThanOrEqual(1);
  expect(await inter("+56952222222", "ticket.creado")).toBe(0);

  // Con la regla APAGADA (default), rige el triage normal (decide el clasificador por contenido).
  await conCliente(A, (c) => fijarConfigTriage(c, A, { modo: "automatico", umbral: 0.5, ticketSoloSiAbandonada: false }));
  const rNorm = await conCliente(A, (c) => T.triarConversacion(c, { canal: "telefono", identidad: "+56944444444", dedupeId: "conv-norm-1", mensajes: msgs, abandonada: false }));
  expect(rNorm.accion).toBe("creado"); // "reclamo / no llega / urgente" → el clasificador lo marca como ticket
});
