import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente, lineaDeTiempo } from "@xhub/modulo-nucleo";
import { validarDefinicion } from "@xhub/sdk-modulo";
import { crearModuloTickets, puedeTransicionar, definicion } from "../src/index.js";
import { crearEquipo, definirAgente, type Agente } from "../src/roles.js";
import { definirSla, sumarMinutosHabiles, HORARIO_DEFECTO } from "../src/sla.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "";
const admin: Agente = { usuarioId: "00000000-0000-0000-0000-0000000000a1", equipoId: null, rol: "admin", activo: true };

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Tickets Mono SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("la definición cumple el SDK", () => { expect(() => validarDefinicion(definicion)).not.toThrow(); });

test("integración real con el núcleo: persona e historia van al núcleo de verdad", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "cli@x.cl", asunto: "No llegó", cuerpo: "..." }));
  expect(t.numero).toBe("1");
  // la interacción está en la línea de tiempo REAL del núcleo (no un stub)
  const persona = await conCliente(A, (c) => nucleoReal.asegurarPersona(c, "email", "cli@x.cl"));
  const tl = await conCliente(A, (c) => lineaDeTiempo(c, persona.id, undefined, 10));
  expect(tl.datos.some((i) => i.objeto_tipo === "ticket" && i.objeto_id === t.id)).toBe(true);
});

test("jerarquía: un agente NO gestiona agentes", async () => {
  const agente: Agente = { usuarioId: "x", equipoId: null, rol: "agente", activo: true };
  await expect(conCliente(A, (c) => definirAgente(c, agente, { usuarioId: "y", rol: "agente" }))).rejects.toMatchObject({ codigo: "SIN_PERMISO" });
});

test("SLA con horario hábil y estados de proceso", async () => {
  await conCliente(A, (c) => definirSla(c, "urgente", { primeraRespuestaMin: 15, resolucionMin: 120 }));
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "sla@x.cl", asunto: "Caído", prioridad: "urgente" }));
  const row = await conCliente(A, (c) => c.query("select sla_primera_resp_vence from tickets where id=$1", [t.id])) as { rows: { sla_primera_resp_vence: unknown }[] };
  expect(row.rows[0].sla_primera_resp_vence).not.toBeNull();
  await expect(conCliente(A, (c) => T.cambiarEstado(c, t.id, "resuelto"))).rejects.toMatchObject({ codigo: "CONFLICTO" });
  expect(puedeTransicionar("nuevo", "resuelto")).toBe(false);
});

test("SLA fuera de horario salta al día hábil", () => {
  const vence = sumarMinutosHabiles(new Date("2026-01-16T20:30:00Z"), 60, HORARIO_DEFECTO);
  expect(new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "long" }).format(vence)).toContain("lunes");
});

test("equipos, escalado y CSAT", async () => {
  const eq = await conCliente(A, (c) => crearEquipo(c, "N2"));
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "esc@x.cl", asunto: "Difícil", prioridad: "baja" }));
  await conCliente(A, (c) => T.escalarAEquipo(c, t.id, eq));
  await conCliente(A, (c) => T.cambiarEstado(c, t.id, "abierto"));
  await conCliente(A, (c) => T.cambiarEstado(c, t.id, "resuelto"));
  await conCliente(A, (c) => T.calificar(c, t.id, 5));
  const row = await conCliente(A, (c) => c.query("select equipo_id, prioridad, satisfaccion from tickets where id=$1", [t.id])) as { rows: any[] };
  expect(row.rows[0].equipo_id).toBe(eq);
  expect(row.rows[0].prioridad).toBe("media");
  expect(row.rows[0].satisfaccion).toBe(5);
});

test("bandeja por jerarquía: admin ve todo, agente solo lo suyo", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "vis@x.cl", asunto: "Visible" }));
  const agente: Agente = { usuarioId: "99999999-9999-9999-9999-999999999999", equipoId: null, rol: "agente", activo: true };
  const bAdmin = await conCliente(A, (c) => T.bandejaDe(c, admin));
  const bAgente = await conCliente(A, (c) => T.bandejaDe(c, agente));
  expect(bAdmin.datos.some((x) => x.id === t.id)).toBe(true);
  expect(bAgente.datos.some((x) => x.id === t.id)).toBe(false);
});

test("bandeja POR HOJAS: 20/50/100 por hoja, total correcto y sin perder tickets", async () => {
  const cid = (await conPlataforma((c) => crearCliente(c, "Hojas SpA"))).id;
  for (let i = 0; i < 25; i++) {
    await conCliente(cid, (c) => T.crearTicket(c, { canal: "email", identidad: `h${i}@x.cl`, asunto: `Ticket ${i}` }));
  }
  const h1 = await conCliente(cid, (c) => T.listarBandejaPagina(c, {}, 20, 0));
  expect(h1.total).toBe(25);
  expect(h1.datos.length).toBe(20);
  const h2 = await conCliente(cid, (c) => T.listarBandejaPagina(c, {}, 20, 20));
  expect(h2.datos.length).toBe(5);
  // ninguna hoja repite ni se salta tickets: juntas son el total exacto
  const vistos = new Set([...h1.datos, ...h2.datos].map((t) => t.id));
  expect(vistos.size).toBe(25);
  // hojas de 100: entra todo de una
  const todo = await conCliente(cid, (c) => T.listarBandejaPagina(c, {}, 100, 0));
  expect(todo.datos.length).toBe(25);
});
