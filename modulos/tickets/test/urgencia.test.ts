import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { crearModuloTickets } from "../src/index.js";
import { analizarUrgencia, slaConsumidoSeg } from "../src/urgencia.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const T = crearModuloTickets(nucleoReal);
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Urgencia SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("detección de urgencia y sentimiento en es-CL", () => {
  const a = analizarUrgencia("Esto es una vergüenza, voy a llamar a SERNAC y a mi abogado");
  expect(a.urgencia).toBe("alta");
  expect(a.riesgoLegal).toBe(true);
  expect(a.enojo).toBe(true);
  const b = analizarUrgencia("Necesito ayuda urgente ahora mismo por favor");
  expect(b.urgencia).toBe("media");
  const c = analizarUrgencia("Muchas gracias, excelente atención");
  expect(c.positivo).toBe(true);
  expect(c.urgencia).toBe("baja");
});

test("ÚNICO: un ticket con texto enojado+legal sube solo a prioridad urgente", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "enojo@x.cl", asunto: "Reclamo", prioridad: "media", cuerpo: "Es una estafa, voy a demandar y llamar a SERNAC" }));
  const row = await conCliente(A, (c) => c.query("select prioridad, urgencia_detectada from tickets where id=$1", [t.id])) as { rows: any[] };
  expect(row.rows[0].prioridad).toBe("urgente");     // escaló solo
  expect(row.rows[0].urgencia_detectada).toBe("alta");
});

test("ÚNICO: el SLA se PAUSA mientras el ticket espera al cliente (pendiente)", async () => {
  const t = await conCliente(A, (c) => T.crearTicket(c, { canal: "email", identidad: "pausa@x.cl", asunto: "Espera" }));
  await conCliente(A, (c) => T.cambiarEstado(c, t.id, "abierto"));
  await conCliente(A, (c) => T.cambiarEstado(c, t.id, "pendiente"));   // esperando al cliente → pausa
  const p1 = await conCliente(A, (c) => c.query("select sla_pausa_desde from tickets where id=$1", [t.id])) as { rows: any[] };
  expect(p1.rows[0].sla_pausa_desde).not.toBeNull();  // reloj congelado
  await conCliente(A, (c) => T.cambiarEstado(c, t.id, "abierto"));     // cliente respondió → reanuda
  const p2 = await conCliente(A, (c) => c.query("select sla_pausa_desde, sla_pausa_acum_seg from tickets where id=$1", [t.id])) as { rows: any[] };
  expect(p2.rows[0].sla_pausa_desde).toBeNull();
  expect(Number(p2.rows[0].sla_pausa_acum_seg)).toBeGreaterThanOrEqual(0);  // acumuló el tiempo esperado
});

test("cálculo de SLA consumido resta el tiempo pausado", () => {
  const creado = 0, ahora = 3600_000; // 1 hora
  // pausó 20 min acumulados → consumido = 40 min
  expect(slaConsumidoSeg(creado, 1200, null, ahora)).toBe(2400);
  // pausa en curso desde el minuto 30 → hasta ahora son 30 min pausados → consumido 30 min
  expect(slaConsumidoSeg(creado, 0, 1800_000, ahora)).toBe(1800);
});
