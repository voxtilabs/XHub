import { test, expect } from "vitest";
import { leerConfigIA, completar, resumirConversacionIA } from "../src/index.js";

test("sin llave, la IA está APAGADA y no rompe nada", async () => {
  const cfg = leerConfigIA(undefined, {} as NodeJS.ProcessEnv);
  expect(cfg.activa).toBe(false);
  expect(await completar([{ role: "user", content: "hola" }], cfg)).toBeNull();
  expect(await resumirConversacionIA([{ autor: "cliente", texto: "hola" }], cfg)).toBeNull();
});

test("proveedor por tarea: DECISION usa JEV/OpenRouter, RESUMEN usa GLM/NVIDIA", () => {
  const env = {
    IA_DECISION_API_KEY: "or-key", IA_DECISION_API_BASE: "https://openrouter.ai/api/v1", IA_DECISION_MODELO: "typesafe/jev-router",
    IA_RESUMEN_API_KEY: "nv-key", IA_RESUMEN_API_BASE: "https://integrate.api.nvidia.com/v1", IA_RESUMEN_MODELO: "z-ai/glm-5.3-flash",
  } as unknown as NodeJS.ProcessEnv;
  const dec = leerConfigIA("DECISION", env);
  expect(dec.modelo).toBe("typesafe/jev-router");
  expect(dec.base).toContain("openrouter");
  const res = leerConfigIA("RESUMEN", env);
  expect(res.modelo).toBe("z-ai/glm-5.3-flash");
  expect(res.base).toContain("nvidia");
});

test("una tarea sin config propia cae a la global", () => {
  const env = { IA_API_KEY: "g", IA_MODELO: "modelo-global" } as unknown as NodeJS.ProcessEnv;
  const cfg = leerConfigIA("DECISION", env);
  expect(cfg.activa).toBe(true);
  expect(cfg.modelo).toBe("modelo-global");
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
