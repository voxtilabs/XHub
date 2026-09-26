import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Sugerencia SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("sin IA, sugerirRespuesta devuelve null (el agente escribe a mano)", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "s@x.cl", asunto: "Consulta", cuerpo: "Hola, ¿cuándo llega mi pedido?" }));
  const s = await conCliente(A, (c) => T.sugerirRespuesta(c, t.id));
  expect(s).toBeNull();  // IA apagada en CI → null, no rompe
});

test("un ticket sin mensajes no sugiere nada", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "vacio@x.cl", asunto: "Vacío" }));
  const s = await conCliente(A, (c) => T.sugerirRespuesta(c, t.id));
  expect(s).toBeNull();
});
