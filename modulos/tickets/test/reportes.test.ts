import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { type Agente } from "../src/roles.js";
import { metricas, rendimientoAgentes } from "../src/reportes.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "";
const admin: Agente = { usuarioId: "00000000-0000-0000-0000-0000000000a1", equipoId: null, rol: "admin", activo: true } as unknown as Agente;
const agente: Agente = { usuarioId: "00000000-0000-0000-0000-0000000000b1", equipoId: null, rol: "agente", activo: true } as unknown as Agente;

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Reportes SA"))).id;
  // sembrar: 3 tickets, 1 resuelto con CSAT, 1 sin asignar
  const agenteId = "22222222-2222-2222-2222-222222222222";
  const t1 = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "a@x.cl", asunto: "Uno" }));
  await conCliente(A, (c) => T.asignarTicket(c, t1.id, agenteId));
  await conCliente(A, (c) => T.responder(c, t1.id, agenteId, "voy"));
  await conCliente(A, (c) => T.cambiarEstado(c, t1.id, "resuelto"));
  await conCliente(A, (c) => T.calificar(c, t1.id, 5));
  const t2 = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "b@x.cl", asunto: "Dos" }));
  await conCliente(A, (c) => T.asignarTicket(c, t2.id, agenteId));
  await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "c@x.cl", asunto: "Sin asignar" }));
});
afterAll(async () => { await cerrarPool(); });

test("métricas del panel de supervisor", async () => {
  const m = await conCliente(A, (c) => metricas(c, admin));
  expect(m.abiertos).toBeGreaterThanOrEqual(2);
  expect(m.sinAsignar).toBeGreaterThanOrEqual(1);
  expect(m.resueltosHoy).toBeGreaterThanOrEqual(1);
  expect(m.csatPromedio).toBe(5);
  expect(m.primeraRespuestaMedianaMin).not.toBeNull();
});

test("un agente NO puede ver reportes (jerarquía)", async () => {
  await expect(conCliente(A, (c) => metricas(c, agente))).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
  await expect(conCliente(A, (c) => rendimientoAgentes(c, agente))).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
});

test("rendimiento por agente: asignados, resueltos, CSAT", async () => {
  const r = await conCliente(A, (c) => rendimientoAgentes(c, admin));
  const ag = r.find((x) => x.agenteId === "22222222-2222-2222-2222-222222222222");
  expect(ag).toBeDefined();
  expect(ag!.asignados).toBe(2);
  expect(ag!.resueltos).toBe(1);
  expect(ag!.csat).toBe(5);
});
