import { test, expect, beforeAll, afterAll } from "vitest";
import { pool, cerrarPool, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente, cambiarEstado, obtenerCliente, puedeTransicionar } from "../src/clientes.js";
import { join } from "node:path";

beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
});
afterAll(async () => { await cerrarPool(); });

test("crear cliente nace en_alta", async () => {
  const cl = await conPlataforma((c) => crearCliente(c, "Empresa Uno"));
  expect(cl.estado).toBe("en_alta");
  expect(cl.nombre).toBe("Empresa Uno");
});

test("nombre vacío es VALIDACION", async () => {
  await expect(conPlataforma((c) => crearCliente(c, "  "))).rejects.toMatchObject({ codigo: "VALIDACION" });
});

test("ciclo de vida válido: en_alta → activo → moroso → activo", async () => {
  const cl = await conPlataforma((c) => crearCliente(c, "Empresa Dos"));
  await conPlataforma((c) => cambiarEstado(c, cl.id, "activo"));
  await conPlataforma((c) => cambiarEstado(c, cl.id, "moroso"));
  const fin = await conPlataforma((c) => cambiarEstado(c, cl.id, "activo"));
  expect(fin.estado).toBe("activo");
});

test("transición inválida es CONFLICTO, no cambio silencioso", async () => {
  const cl = await conPlataforma((c) => crearCliente(c, "Empresa Tres"));
  // en_alta no puede ir directo a moroso
  await expect(
    conPlataforma((c) => cambiarEstado(c, cl.id, "moroso")),
  ).rejects.toMatchObject({ codigo: "CONFLICTO" });
  // y el estado no cambió
  const sigue = await conPlataforma((c) => obtenerCliente(c, cl.id));
  expect(sigue.estado).toBe("en_alta");
});

test("cambiar al mismo estado es idempotente", async () => {
  const cl = await conPlataforma((c) => crearCliente(c, "Empresa Cuatro"));
  const r = await conPlataforma((c) => cambiarEstado(c, cl.id, "en_alta"));
  expect(r.estado).toBe("en_alta");
});

test("tabla de transiciones", () => {
  expect(puedeTransicionar("activo", "solo_lectura")).toBe(true);
  expect(puedeTransicionar("en_alta", "moroso")).toBe(false);
  expect(puedeTransicionar("suspendido", "activo")).toBe(true);
});
