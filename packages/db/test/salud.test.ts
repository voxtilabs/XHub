import { test, expect, afterAll } from "vitest";
import { baseViva } from "../src/salud.js";
import { cerrarPool } from "../src/pool.js";
afterAll(async () => { await cerrarPool(); });
test("/listo ve la base viva", async () => {
  expect(await baseViva()).toBe(true);
});
