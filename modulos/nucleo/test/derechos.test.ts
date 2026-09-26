import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar, tomarPendientes, verificarCadena } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { asegurarPersonaPorIdentidad } from "../src/personas.js";
import { registrarInteraccion } from "../src/interacciones.js";
import { buscarPersonas } from "../src/ficha.js";
import { exportarPersona, suprimirPersona } from "../src/derechos.js";
import { join } from "node:path";

let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Derechos SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("DERECHO DE ACCESO: exporta todos los datos de la persona", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "juan@x.cl", "Juan Pérez"));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: p.id, tipo: "llamada", moduloOrigen: "conector", resumen: "Llamó por su pedido" }));
  const exp = await conCliente(A, (c) => exportarPersona(c, p.id)) as any;
  expect(exp.persona.nombre).toBe("Juan Pérez");
  expect(exp.identidades.some((i: any) => i.identificador === "juan@x.cl")).toBe(true);
  expect(exp.interacciones.length).toBeGreaterThan(0);
});

test("DERECHO DE SUPRESIÓN: anonimiza sin borrar la fila; el contenido se va, el hecho queda", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "pedro@x.cl", "Pedro Soto"));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: p.id, tipo: "email", moduloOrigen: "nucleo", resumen: "Datos sensibles del cliente" }));
  await conCliente(A, (c) => suprimirPersona(c, p.id, "Solicitud del titular art. 11"));
  // la fila de la persona SIGUE existiendo (los objetos cuelgan de ella), pero anonimizada
  const per = await conCliente(A, (c) => c.query("select nombre, suprimida_en from nucleo.personas where id=$1", [p.id])) as any;
  expect(per.rows[0].nombre).toBeNull();
  expect(per.rows[0].suprimida_en).not.toBeNull();
  // la identidad quedó como token no reversible (sin el email)
  const ident = await conCliente(A, (c) => c.query("select identificador from nucleo.identidades where persona_id=$1", [p.id])) as any;
  expect(ident.rows[0].identificador).toMatch(/^suprimido:/);
  expect(ident.rows[0].identificador).not.toContain("pedro@x.cl");
  // el contenido de las interacciones se vació (el hecho y su seq quedan)
  const inter = await conCliente(A, (c) => c.query("select resumen from nucleo.interacciones where persona_id=$1", [p.id])) as any;
  expect(inter.rows.every((x: any) => x.resumen === null)).toBe(true);
});

test("supresión sin motivo es rechazada (obligatorio)", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "sinmotivo@x.cl"));
  await expect(conCliente(A, (c) => suprimirPersona(c, p.id, "  "))).rejects.toMatchObject({ codigo: "VALIDACION" });
});

test("tras suprimir, la búsqueda ya no encuentra a la persona por su nombre", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "ana@x.cl", "Ana Buscar"));
  expect((await conCliente(A, (c) => buscarPersonas(c, "Ana Buscar"))).length).toBeGreaterThan(0);
  await conCliente(A, (c) => suprimirPersona(c, p.id, "Solicitud"));
  expect((await conCliente(A, (c) => buscarPersonas(c, "Ana Buscar"))).length).toBe(0);
});

test("la supresión emite persona.suprimida y NO rompe la auditoría (es la evidencia)", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "ev@x.cl"));
  await conCliente(A, (c) => suprimirPersona(c, p.id, "Solicitud"));
  const evs = await conCliente(A, (c) => tomarPendientes(c, ["nucleo"], 50));
  expect(evs.some((e) => e.tipo === "persona.suprimida")).toBe(true);
  // la cadena de auditoría sigue íntegra (la evidencia no se anonimiza)
  expect((await verificarCadena()).valida).toBe(true);
});
