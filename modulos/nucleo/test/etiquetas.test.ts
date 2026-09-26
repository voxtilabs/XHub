import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { asegurarPersonaPorIdentidad } from "../src/personas.js";
import { crearEtiqueta, aplicarEtiqueta, personasConEtiqueta, definirCampo, ponerValor, objetosPorCampo } from "../src/etiquetas.js";
import { join } from "node:path";

let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Tags SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("color de etiqueta es un ROL, no un hex", async () => {
  await conCliente(A, (c) => crearEtiqueta(c, "VIP", "accion"));
  await expect(
    conCliente(A, (c) => c.query("insert into nucleo.etiquetas (cliente_id,nombre,color_rol) values ($1,'x','#ff0000')", [A])),
  ).rejects.toThrow(/check|color_rol/i);
});

test("nombre de etiqueta único por cliente (sin distinguir mayúsculas)", async () => {
  await conCliente(A, (c) => crearEtiqueta(c, "Moroso"));
  await expect(conCliente(A, (c) => crearEtiqueta(c, "moroso"))).rejects.toMatchObject({ codigo: "CONFLICTO" });
});

test("aplicar etiqueta y filtrar personas", async () => {
  const et = await conCliente(A, (c) => crearEtiqueta(c, "Prospecto", "senal"));
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "p@x.cl"));
  await conCliente(A, (c) => aplicarEtiqueta(c, p.id, et.id));
  await conCliente(A, (c) => aplicarEtiqueta(c, p.id, et.id)); // idempotente
  const con = await conCliente(A, (c) => personasConEtiqueta(c, et.id));
  expect(con).toContain(p.id);
  expect(con.length).toBe(1);
});

test("campos personalizados: definir, poner valor, filtrar", async () => {
  const campo = await conCliente(A, (c) => definirCampo(c, "persona", "sucursal", "texto"));
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "campo@x.cl"));
  await conCliente(A, (c) => ponerValor(c, "persona", p.id, campo, "Providencia"));
  await conCliente(A, (c) => ponerValor(c, "persona", p.id, campo, "Las Condes")); // upsert
  const enLasCondes = await conCliente(A, (c) => objetosPorCampo(c, campo, "Las Condes"));
  expect(enLasCondes).toContain(p.id);
  const enProvidencia = await conCliente(A, (c) => objetosPorCampo(c, campo, "Providencia"));
  expect(enProvidencia).not.toContain(p.id); // se sobrescribió
});
