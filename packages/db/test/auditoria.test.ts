import { test, expect, beforeAll, afterAll } from "vitest";
import { pool, cerrarPool } from "../src/pool.js";
import { cargarDe, migrar } from "../src/migraciones.js";
import { auditar, verificarCadena } from "../src/auditoria.js";
import { join } from "node:path";

beforeAll(async () => { await migrar(cargarDe(join(__dirname, "..", "migrations"))); });
afterAll(async () => { await cerrarPool(); });

test("escribe entradas y la cadena queda válida", async () => {
  await auditar({ actorTipo: "sistema", accion: "arranque", resultado: "ok" });
  await auditar({ actorTipo: "usuario", actorId: "u1", accion: "login", resultado: "ok" });
  const v = await verificarCadena();
  expect(v.valida).toBe(true);
  expect(v.entradas).toBeGreaterThanOrEqual(2);
});

test("no se puede actualizar una entrada (append-only)", async () => {
  await expect(
    pool().query("update nucleo.auditoria set accion='x' where seq=(select min(seq) from nucleo.auditoria)"),
  ).rejects.toThrow(/append-only/);
});

test("no se puede borrar una entrada", async () => {
  await expect(
    pool().query("delete from nucleo.auditoria where seq=(select min(seq) from nucleo.auditoria)"),
  ).rejects.toThrow(/append-only/);
});

test("la verificación detecta una manipulación", async () => {
  // Manipular requiere saltarse el trigger: lo hacemos deshabilitándolo como owner,
  // que es justo lo que un atacante con acceso a la base intentaría.
  await pool().query("alter table nucleo.auditoria disable trigger t_auditoria_no_update");
  await pool().query(
    "update nucleo.auditoria set metadata='{\"tocado\":true}' where seq=(select min(seq) from nucleo.auditoria)",
  );
  await pool().query("alter table nucleo.auditoria enable trigger t_auditoria_no_update");
  const v = await verificarCadena();
  expect(v.valida).toBe(false);
  expect(v.rotaEn).not.toBeNull();
});
