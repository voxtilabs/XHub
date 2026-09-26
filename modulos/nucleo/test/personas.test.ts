import { test, expect, beforeAll, afterAll } from "vitest";
import { pool, cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { asegurarPersonaPorIdentidad, adjuntarIdentidad, identidadesDe, resolverRaiz } from "../src/personas.js";
import { normalizarTelefono, normalizarRut, normalizarEmail } from "../src/normalizar.js";
import { join } from "node:path";

const migDir = join(__dirname, "..", "..", "..", "packages", "db", "migrations");
let A = "", B = "";
beforeAll(async () => {
  await migrar(cargarDe(migDir));
  A = (await conPlataforma((c) => crearCliente(c, "Cliente A"))).id;
  B = (await conPlataforma((c) => crearCliente(c, "Cliente B"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("normalización chilena: distintos formatos colapsan a lo mismo", () => {
  const e = "+56912345678";
  expect(normalizarTelefono("+56912345678")).toBe(e);
  expect(normalizarTelefono("56912345678")).toBe(e);
  expect(normalizarTelefono("912345678")).toBe(e);
  expect(normalizarTelefono("9 1234 5678")).toBe(e);
  expect(normalizarEmail("  Juan@Empresa.CL ")).toBe("juan@empresa.cl");
  expect(normalizarRut("12.345.678-5")).toBe(normalizarRut("012345678-5"));
  expect(() => normalizarRut("12345678-0")).toThrow(/verificador/); // DV malo no fusiona por tipeo
});

test("EL TELÉFONO NO ES LA LLAVE: persona solo por webchat, sin teléfono jamás", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "sesion-xyz"));
  const ids = await conCliente(A, (c) => identidadesDe(c, p.id));
  expect(ids).toEqual([{ canal: "webchat", identificador: "sesion-xyz", seq: expect.any(String) }]);
});

test("mismo id en instagram y messenger son DOS personas", async () => {
  const ig = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "instagram", "id-123"));
  const ms = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "messenger", "id-123"));
  expect(ig.id).not.toBe(ms.id);
});

test("idempotente: la misma identidad devuelve la misma persona", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "telefono", "912345678"));
  const p2 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "telefono", "+56912345678"));
  expect(p1.id).toBe(p2.id);
});

test("dos transacciones concurrentes sobre la misma identidad → una sola persona", async () => {
  const [r1, r2] = await Promise.all([
    conCliente(B, (c) => asegurarPersonaPorIdentidad(c, "email", "concurrente@x.cl")),
    conCliente(B, (c) => asegurarPersonaPorIdentidad(c, "email", "concurrente@x.cl")),
  ]);
  expect(r1.id).toBe(r2.id);
  const ids = await conCliente(B, (c) => identidadesDe(c, r1.id));
  expect(ids.filter((i) => i.canal === "email").length).toBe(1);
});

test("aislamiento: una persona de A no se resuelve desde B", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "solo-a@x.cl"));
  await expect(conCliente(B, (c) => resolverRaiz(c, p.id))).rejects.toMatchObject({ codigo: "NO_ENCONTRADO" });
});

test("una identidad no se puede robar a otra persona", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "dueno@x.cl"));
  const p2 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "otro"));
  await expect(conCliente(A, (c) => adjuntarIdentidad(c, p2.id, "email", "dueno@x.cl")))
    .rejects.toMatchObject({ codigo: "CONFLICTO" });
});
