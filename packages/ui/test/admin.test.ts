import { test, expect } from "vitest";
import { rolDeEstado, pctCuota, nivelConsumo, modulosApagables, resumen, type ClienteVista } from "../src/admin/modelo.js";

const cli = (over: Partial<ClienteVista> = {}): ClienteVista => ({
  id: "1", nombre: "X", estado: "activo", modulos: ["tickets"], usoApiMes: 0, cuotaApiMes: 100, ...over,
});

test("color de estado es un rol, no un hex", () => {
  expect(rolDeEstado("activo")).toBe("exito");
  expect(rolDeEstado("moroso")).toBe("accion");
  expect(rolDeEstado("en_alta")).toBe("senal");
});

test("porcentaje de cuota acotado y sin dividir por cero", () => {
  expect(pctCuota(cli({ usoApiMes: 50, cuotaApiMes: 100 }))).toBe(50);
  expect(pctCuota(cli({ usoApiMes: 200, cuotaApiMes: 100 }))).toBe(100);
  expect(pctCuota(cli({ cuotaApiMes: 0 }))).toBe(0);
});

test("nivel de consumo: ok / aviso / excedido", () => {
  expect(nivelConsumo(cli({ usoApiMes: 10 }))).toBe("ok");
  expect(nivelConsumo(cli({ usoApiMes: 85 }))).toBe("aviso");
  expect(nivelConsumo(cli({ usoApiMes: 100 }))).toBe("excedido");
});

test("módulos apagables excluyen núcleo y plataforma", () => {
  const r = modulosApagables(["nucleo", "plataforma", "tickets", "crm"], ["tickets"]);
  expect(r.map((x) => x.modulo)).toEqual(["tickets", "crm"]);
  expect(r.find((x) => x.modulo === "tickets")!.encendido).toBe(true);
  expect(r.find((x) => x.modulo === "crm")!.encendido).toBe(false);
});

test("resumen cuenta activos y en alerta", () => {
  const r = resumen([
    cli({ estado: "activo", usoApiMes: 10 }),
    cli({ estado: "activo", usoApiMes: 90 }),   // en alerta
    cli({ estado: "moroso", usoApiMes: 0 }),
  ]);
  expect(r.totalClientes).toBe(3);
  expect(r.activos).toBe(2);
  expect(r.enAlerta).toBe(1);
});
