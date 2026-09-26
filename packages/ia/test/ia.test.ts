import { test, expect } from "vitest";
import { leerConfigIA, completar, resumirConversacionIA } from "../src/index.js";

test("sin llave, la IA está APAGADA y no rompe nada", async () => {
  const cfg = leerConfigIA({} as NodeJS.ProcessEnv);
  expect(cfg.activa).toBe(false);
  expect(await completar([{ role: "user", content: "hola" }], cfg)).toBeNull();
  expect(await resumirConversacionIA([{ autor: "cliente", texto: "hola" }], cfg)).toBeNull();
});

test("proveedor y modelo son configurables por env (multi-proveedor)", () => {
  const cfg = leerConfigIA({ IA_API_KEY: "x", IA_MODELO: "z-ai/glm-5.3", IA_API_BASE: "https://otro/v1" } as unknown as NodeJS.ProcessEnv);
  expect(cfg.activa).toBe(true);
  expect(cfg.modelo).toBe("z-ai/glm-5.3");
  expect(cfg.base).toBe("https://otro/v1");
});

// Contacto real con GLM: SOLO corre si IA_API_KEY está en el entorno. Nunca en CI.
const conLlave = process.env.IA_API_KEY ? test : test.skip;
conLlave("GLM 5.3 resume una conversación de verdad", async () => {
  const resumen = await resumirConversacionIA([
    { autor: "cliente", texto: "Mi pedido A-1902 no llega hace 5 días" },
    { autor: "agente", texto: "Lamento la demora, reviso con despacho" },
    { autor: "cliente", texto: "Ya reclamé antes, esto es una vergüenza" },
  ]);
  expect(resumen).toBeTruthy();
  expect(resumen!.length).toBeGreaterThan(10);
  expect(resumen!.length).toBeLessThan(400);
}, 70000);
