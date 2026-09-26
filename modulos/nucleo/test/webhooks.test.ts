import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { crearWebhook, rotarSecreto, encolarEvento, firmar, verificarFirma, proximoIntento } from "../src/webhooks.js";
import { join } from "node:path";

let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Webhooks SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("la URL debe ser https", async () => {
  await expect(conCliente(A, (c) => crearWebhook(c, "http://x.cl/hook", ["ticket.creado"])))
    .rejects.toMatchObject({ codigo: "VALIDACION" });
});

test("crear webhook devuelve secreto whsec_", async () => {
  const w = await conCliente(A, (c) => crearWebhook(c, "https://cliente.cl/hook", ["ticket.creado"]));
  expect(w.secreto).toMatch(/^whsec_/);
});

test("encolar entrega SOLO a los suscritos al evento, sin HTTP en la tx", async () => {
  // cliente aislado para no contar webhooks de otros tests
  const C = (await conPlataforma((c) => crearCliente(c, "Encolar SA"))).id;
  await conCliente(C, (c) => crearWebhook(c, "https://a.cl/h", ["ticket.creado"]));
  await conCliente(C, (c) => crearWebhook(c, "https://b.cl/h", ["persona.fusionada"]));
  const n = await conCliente(C, (c) => encolarEvento(c, "ticket.creado", { id: "TK-1" }));
  expect(n).toBe(1); // solo el suscrito a ticket.creado
});

test("firma estilo Stripe se verifica; una alterada no", () => {
  const cuerpo = JSON.stringify({ id: "TK-1" });
  const cab = firmar("whsec_x", 1000, cuerpo);
  expect(verificarFirma("whsec_x", cab, cuerpo, 1100)).toBe(true);   // dentro de la ventana
  expect(verificarFirma("whsec_x", cab, cuerpo, 2000)).toBe(false);  // fuera de 300s
  expect(verificarFirma("whsec_x", cab, cuerpo + "x", 1100)).toBe(false); // cuerpo alterado
  expect(verificarFirma("whsec_otro", cab, cuerpo, 1100)).toBe(false);    // secreto distinto
});

test("rotar secreto invalida el anterior", async () => {
  const w = await conCliente(A, (c) => crearWebhook(c, "https://r.cl/h", ["x"]));
  const nuevo = await conCliente(A, (c) => rotarSecreto(c, w.id));
  expect(nuevo).not.toBe(w.secreto);
  const cuerpo = "{}";
  const cab = firmar(w.secreto, 1000, cuerpo);   // firmado con el viejo
  expect(verificarFirma(nuevo, cab, cuerpo, 1050)).toBe(false); // el nuevo no lo valida
});

test("backoff exponencial y apagado tras 6 intentos", () => {
  expect(proximoIntento(0)).toBe(60);
  expect(proximoIntento(1)).toBe(120);
  expect(proximoIntento(5)).toBe(1920);
  expect(proximoIntento(6)).toBeNull(); // se apaga
});
