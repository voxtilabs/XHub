import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente, registrarInteraccion, asegurarPersonaPorIdentidad } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { contextoOmnicanal, reincidencia, ticketsRelacionados, fusionarTickets } from "../src/contexto.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Omni SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("ÚNICO: el ticket trae el contexto OMNICANAL de la persona (llamadas + WhatsApp + ticket)", async () => {
  // la persona ya tuvo una llamada y un WhatsApp (de XContact, en el núcleo)
  const persona = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "omni@x.cl"));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: persona.id, tipo: "llamada", moduloOrigen: "conector", resumen: "Llamada entrante 4m" }));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: persona.id, tipo: "whatsapp", moduloOrigen: "conector", resumen: "Consulta por pedido" }));
  // ahora abre un ticket
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "omni@x.cl", asunto: "Sigo esperando" }));
  const ctx = await conCliente(A, (c) => contextoOmnicanal(c, t.id));
  const tipos = ctx.map((x) => x.tipo);
  expect(tipos).toContain("llamada");     // ← lo que Zendesk NO sabe
  expect(tipos).toContain("whatsapp");
  expect(tipos).toContain("ticket.creado");
  // vienen de módulos distintos, una sola historia
  expect(new Set(ctx.map((x) => x.modulo)).size).toBeGreaterThan(1);
});

test("ÚNICO: detección de reincidencia (cliente que reclama repetido)", async () => {
  const id = "reinc@x.cl";
  for (let i = 0; i < 3; i++) await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: id, asunto: `Reclamo ${i}`, canalOrigen: "email" }));
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: id, asunto: "Otro más" }));
  const r = await conCliente(A, (c) => reincidencia(c, t.id));
  expect(r.totalTickets).toBeGreaterThanOrEqual(4);
  expect(r.esRecurrente).toBe(true);   // ≥3 en 30 días
  expect(r.mismoCanal["email"]).toBeGreaterThanOrEqual(3);
});

test("ÚNICO: tickets relacionados de la misma persona (deduplicar)", async () => {
  const id = "dup@x.cl";
  const t1 = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: id, asunto: "Pedido no llega" }));
  const t2 = await conCliente(A, (c) => T.crearTicket(c, { canal: "telefono", identidad: "+56911112222", asunto: "Mismo problema por teléfono" }));
  // t2 es otra persona (otro canal) — los relacionados de t1 no lo incluyen
  const rel1 = await conCliente(A, (c) => ticketsRelacionados(c, t1.id));
  expect(rel1.some((x) => x.id === t2.id)).toBe(false);
  // pero un segundo ticket de la MISMA persona (email) sí
  const t3 = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: id, asunto: "Otra vez" }));
  const rel3 = await conCliente(A, (c) => ticketsRelacionados(c, t3.id));
  expect(rel3.some((x) => x.id === t1.id)).toBe(true);
});

test("fusionar tickets duplicados: mueve mensajes y cierra el duplicado", async () => {
  const id = "fus@x.cl";
  const t1 = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: id, asunto: "Principal", cuerpo: "hola" }));
  const t2 = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: id, asunto: "Duplicado", cuerpo: "lo mismo" }));
  await conCliente(A, (c) => fusionarTickets(c, t1.id, t2.id));
  const dup = await conCliente(A, (c) => c.query("select estado from tickets where id=$1", [t2.id])) as { rows: any[] };
  expect(dup.rows[0].estado).toBe("cerrado");
  const msgs = await conCliente(A, (c) => c.query("select count(*)::int n from tickets_mensajes where ticket_id=$1", [t1.id])) as { rows: any[] };
  expect(msgs.rows[0].n).toBeGreaterThanOrEqual(2); // absorbió el mensaje del duplicado + aviso
});
