import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente, fusionarPersonas, lineaDeTiempo, asegurarPersonaPorIdentidad } from "@xhub/modulo-nucleo";
import { validarDefinicion } from "@xhub/sdk-modulo";
import { definicion, crearNota } from "../src/index.js";
import { join } from "node:path";

let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Ejemplo SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("la definición del módulo es válida según el SDK", () => {
  expect(() => validarDefinicion(definicion)).not.toThrow();
});

test("el módulo NO puede llamarse como el núcleo", () => {
  expect(() => validarDefinicion({ ...definicion, manifiesto: { ...definicion.manifiesto, nombre: "nucleo" } }))
    .toThrow(/reservado/);
});

test("una ruta con scope no declarado en permisos es rechazada", () => {
  expect(() => validarDefinicion({
    ...definicion,
    rutas: [{ metodo: "GET", ruta: "/x", scope: "ejemplo.inventado" }],
  })).toThrow(/no lista en permisos/);
});

test("crearNota guarda SU objeto pero la persona e historia van al núcleo", async () => {
  const nota = await conCliente(A, (c) => crearNota(c, "email", "cliente@x.cl", "primera nota"));
  expect(nota.texto).toBe("primera nota");
  // la persona existe en el núcleo (no en el módulo)
  const persona = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "cliente@x.cl"));
  expect(persona.id).toBe(nota.persona_id);
  // la interacción está en la línea de tiempo del NÚCLEO
  const tl = await conCliente(A, (c) => lineaDeTiempo(c, persona.id, undefined, 10));
  expect(tl.datos.some((i) => i.objeto_tipo === "nota" && i.objeto_id === nota.id)).toBe(true);
});

test("el consumidor de fusión re-apunta las notas del módulo al superviviente", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "f-a@x.cl"));
  const nota = await conCliente(A, (c) => crearNota(c, "webchat", "f-web", "nota de la dup"));
  const dupId = nota.persona_id;
  // fusionar la de webchat en la de email
  await conCliente(A, (c) => fusionarPersonas(c, p1.id, dupId));
  // aplicar el consumidor del módulo manualmente (lo haría el despachador)
  await conCliente(A, (c) => definicion.consumidores![0].manejar(c, {
    id: "ev1", tipo: "persona.fusionada", clienteId: A,
    payload: { principalId: p1.id, duplicadaId: dupId },
  }));
  const r = await conCliente(A, (c) =>
    c.query("select persona_id from ejemplo_notas where id=$1", [nota.id]));
  expect(r.rows[0].persona_id).toBe(p1.id); // re-apuntada al superviviente
});
