import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { crearEquipo, definirAgente, type Agente } from "../src/roles.js";
import { autoAsignar, verTicket, otrosViendo, aplicarDisparadores } from "../src/automatizacion.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "", eq = "";
const admin: Agente = { usuarioId: "00000000-0000-0000-0000-0000000000a1", equipoId: null, rol: "admin", activo: true };
const AG = ["10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002", "10000000-0000-0000-0000-000000000003"];

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Auto SA"))).id;
  eq = await conCliente(A, (c) => crearEquipo(c, "N1"));
  for (const u of AG) await conCliente(A, (c) => definirAgente(c, admin, { usuarioId: u, equipoId: eq, rol: "agente" }));
});
afterAll(async () => { await cerrarPool(); });

test("round-robin reparte entre los agentes del equipo, en orden y ciclando", async () => {
  const asignados: string[] = [];
  for (let i = 0; i < 6; i++) {
    const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: `rr${i}@x.cl`, asunto: `T${i}` }));
    const a = await conCliente(A, (c) => autoAsignar(c, t.id, eq));
    asignados.push(a!);
  }
  // 3 agentes, 6 tickets → cada uno recibe 2
  const cuenta = AG.map((u) => asignados.filter((x) => x === u).length);
  expect(cuenta).toEqual([2, 2, 2]);
});

test("colisión: dos agentes viendo el mismo ticket se detectan", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "col@x.cl", asunto: "Colisión" }));
  await conCliente(A, (c) => verTicket(c, t.id, AG[0]));
  await conCliente(A, (c) => verTicket(c, t.id, AG[1]));
  const otros = await conCliente(A, (c) => otrosViendo(c, t.id, AG[0]));
  expect(otros).toContain(AG[1]);
  expect(otros).not.toContain(AG[0]); // no me cuento a mí mismo
});

test("presencia vieja no cuenta como colisión", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "vieja@x.cl", asunto: "Vieja" }));
  await conCliente(A, (c) => verTicket(c, t.id, AG[1]));
  // ventana de 0 segundos: nada reciente
  const otros = await conCliente(A, (c) => otrosViendo(c, t.id, AG[0], 0));
  expect(otros.length).toBe(0);
});

test("disparadores: auto-asigna y deja acuse de recibo", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "disp@x.cl", asunto: "Disparador", equipoId: eq }));
  const r = await conCliente(A, (c) => aplicarDisparadores(c, t.id, eq, { autoAsignarEquipo: true, autoRespuesta: "Recibimos tu solicitud, te responderemos pronto." }));
  expect(r.asignadoA).not.toBeNull();
  const msg = await conCliente(A, (c) => c.query("select autor_tipo, cuerpo from tickets_mensajes where ticket_id=$1 and autor_tipo='sistema'", [t.id])) as { rows: any[] };
  expect(msg.rows[0].cuerpo).toContain("Recibimos");
});
