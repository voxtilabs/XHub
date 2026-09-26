import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { consumidorSupresion } from "../src/derechos.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
const AG = "20000000-0000-0000-0000-0000000000f1";
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Supresión SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("al suprimir a la persona, sus tickets pierden el CONTENIDO pero conservan el registro (número, estado, fechas)", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "cliente@x.cl", asunto: "Reclamo por el pedido 8842", cuerpo: "Mi dirección es Av. Siempre Viva 742, teléfono +56 9 1234 5678" }));
  await conCliente(A, (c) => T.responder(c, t.id, AG, "Estimado, lo llamamos al +56912345678 para coordinar"));

  const r = await conCliente(A, (c) => consumidorSupresion.manejar(c, { clienteId: A, payload: { personaId: t.persona_id } }));
  expect(r.tickets).toBe(1);

  // la FILA del ticket sigue existiendo, con su número y su estado
  const row = await conCliente(A, (c) => c.query("select numero, estado, asunto, resumen from tickets where id=$1", [t.id])) as any;
  expect(row.rows).toHaveLength(1);
  expect(row.rows[0].numero).toBe(t.numero);         // el registro contable no se pierde
  expect(row.rows[0].asunto).toBe("[suprimido]");     // el contenido personal sí
  expect(row.rows[0].resumen).toBeNull();

  // ningún mensaje conserva el cuerpo con PII (dirección, teléfono)
  const msgs = await conCliente(A, (c) => c.query("select cuerpo from tickets_mensajes where ticket_id=$1", [t.id])) as any;
  expect(msgs.rows.length).toBeGreaterThan(0);
  for (const m of msgs.rows) {
    expect(m.cuerpo).toBe("[contenido suprimido]");
    expect(m.cuerpo).not.toContain("Siempre Viva");
    expect(m.cuerpo).not.toContain("1234 5678");
  }
});

test("es idempotente y no toca los tickets de otras personas", async () => {
  const mio = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "otro@x.cl", asunto: "Consulta de otro cliente", cuerpo: "hola" }));
  const victima = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "victima@x.cl", asunto: "A suprimir", cuerpo: "dato" }));
  await conCliente(A, (c) => consumidorSupresion.manejar(c, { clienteId: A, payload: { personaId: victima.persona_id } }));
  await conCliente(A, (c) => consumidorSupresion.manejar(c, { clienteId: A, payload: { personaId: victima.persona_id } })); // dos veces
  const otro = await conCliente(A, (c) => c.query("select asunto from tickets where id=$1", [mio.id])) as any;
  expect(otro.rows[0].asunto).toBe("Consulta de otro cliente"); // intacto
});
