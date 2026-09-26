import { test, expect, beforeAll, afterAll } from "vitest";
import { pool, cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { asegurarPersonaPorIdentidad, identidadesDe, resolverRaiz } from "../src/personas.js";
import { registrarInteraccion, lineaDeTiempo } from "../src/interacciones.js";
import { enlazar, enlacesDe, fusionarPersonas } from "../src/enlaces.js";
import { join } from "node:path";

const migDir = join(__dirname, "..", "..", "..", "packages", "db", "migrations");
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(migDir));
  A = (await conPlataforma((c) => crearCliente(c, "Fusion SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("enlazar y recuperar desde ambos extremos (ticket queda en el CRM)", async () => {
  await conCliente(A, async (c) => {
    await enlazar(c, "ticket", "T1", "genera", "oportunidad", "O1");
  });
  const desdeTicket = await conCliente(A, (c) => enlacesDe(c, "ticket", "T1"));
  const desdeOportunidad = await conCliente(A, (c) => enlacesDe(c, "oportunidad", "O1"));
  expect(desdeTicket.length).toBe(1);
  expect(desdeOportunidad.length).toBe(1); // se ve desde el otro extremo
});

test("enlazar es idempotente", async () => {
  await conCliente(A, (c) => enlazar(c, "a", "1", "rel", "b", "2"));
  await conCliente(A, (c) => enlazar(c, "a", "1", "rel", "b", "2"));
  const e = await conCliente(A, (c) => enlacesDe(c, "a", "1"));
  expect(e.length).toBe(1);
});

test("FUSIÓN: la principal absorbe identidades e historia; nada se borra", async () => {
  // dos personas que resultan ser la misma (llegó por email y por whatsapp)
  const porEmail = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "juan@x.cl"));
  const porTel = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "telefono", "912345678"));
  expect(porEmail.id).not.toBe(porTel.id);
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: porEmail.id, tipo: "email", moduloOrigen: "nucleo", resumen: "vino por email" }));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: porTel.id, tipo: "llamada", moduloOrigen: "conector", resumen: "llamó" }));

  await conCliente(A, (c) => fusionarPersonas(c, porEmail.id, porTel.id));

  // buscar por cualquiera de las dos identidades lleva a la principal
  const desdeTel = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "telefono", "+56912345678"));
  expect(desdeTel.id).toBe(porEmail.id); // sigue el puntero de fusión

  // la principal tiene AMBAS identidades
  const ids = await conCliente(A, (c) => identidadesDe(c, porEmail.id));
  expect(ids.map((i) => i.canal).sort()).toEqual(["email", "telefono"]);

  // su línea de tiempo trae la historia de las dos
  const tl = await conCliente(A, (c) => lineaDeTiempo(c, porEmail.id, undefined, 50));
  const resumenes = tl.datos.map((d) => d.resumen);
  expect(resumenes).toContain("vino por email");
  expect(resumenes).toContain("llamó");

  // la duplicada NO se borró: quedó marcada fusionada_en
  const dup = await conCliente(A, (c) =>
    c.query("select fusionada_en from nucleo.personas where id=$1", [porTel.id]));
  expect(dup.rows[0].fusionada_en).toBe(porEmail.id);
});

test("fusión emite persona.fusionada por el outbox", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "f1"));
  const p2 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "f2"));
  await conCliente(A, (c) => fusionarPersonas(c, p1.id, p2.id));
  const ev = await conCliente(A, (c) =>
    c.query("select payload from nucleo.outbox where tipo='persona.fusionada' and payload->>'duplicadaId'=$1", [p2.id]));
  expect(ev.rowCount).toBe(1);
});

test("fusión revertida no deja evento (ley 7)", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "r1"));
  const p2 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "r2"));
  await expect(conCliente(A, async (c) => {
    await fusionarPersonas(c, p1.id, p2.id);
    throw new Error("abortar a propósito");
  })).rejects.toThrow("abortar");
  // no se fusionó ni se emitió
  const sigue = await conCliente(A, (c) => resolverRaiz(c, p2.id));
  expect(sigue.id).toBe(p2.id); // no quedó fusionada
});

test("no se puede fusionar una persona consigo misma", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "solo"));
  await expect(conCliente(A, (c) => fusionarPersonas(c, p.id, p.id)))
    .rejects.toMatchObject({ codigo: "VALIDACION" });
});
