import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { crearWebhook, rotarSecreto, encolarEvento, firmar, verificarFirma, proximoIntento,
  entregarWebhooksPendientes, esIpInterna } from "../src/webhooks.js";
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

test("esIpInterna reconoce loopback, privados, link-local, ULA y metadata", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "172.31.255.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"])
    expect(esIpInterna(ip)).toBe(true);
  for (const ip of ["93.184.216.34", "1.1.1.1", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])
    expect(esIpInterna(ip)).toBe(false);
});

test("despacho: 200 → entregado; destino interno bloqueado sin salir a la red", async () => {
  const C = (await conPlataforma((c) => crearCliente(c, "Despacho SA"))).id;
  await conCliente(C, (c) => crearWebhook(c, "https://93.184.216.34/h", ["ticket.creado"]));  // IP pública
  await conCliente(C, (c) => crearWebhook(c, "https://192.168.5.5/h", ["ticket.creado"]));     // IP interna
  await conCliente(C, (c) => encolarEvento(c, "ticket.creado", { id: "TK-9" }));
  // El stub REVIENTA si lo llaman con una IP interna: prueba que el guard corta antes del POST.
  const stub = (async (u: string) => {
    const h = new URL(String(u)).hostname;
    if (/^(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) throw new Error("SSRF: no debía salir a " + h);
    return { status: 200 } as Response;
  }) as unknown as typeof fetch;
  await entregarWebhooksPendientes(conPlataforma, { fetchImpl: stub, limite: 20 });
  const filas = await conPlataforma(async (c) => (await c.query(
    "select w.url, e.estado from plataforma.webhook_entregas e join plataforma.webhooks w on w.id=e.webhook_id where e.cliente_id=$1", [C])).rows);
  expect(filas.find((f) => f.url.includes("93.184")).estado).toBe("entregado");
  expect(filas.find((f) => f.url.includes("192.168")).estado).toBe("fallido"); // bloqueado, sin reintento
});

test("despacho: 500 reprograma (sigue pendiente con backoff)", async () => {
  const C = (await conPlataforma((c) => crearCliente(c, "Reprograma SA"))).id;
  await conCliente(C, (c) => crearWebhook(c, "https://93.184.216.34/h", ["ticket.creado"]));
  await conCliente(C, (c) => encolarEvento(c, "ticket.creado", { id: "TK-x" }));
  const stub500 = (async () => ({ status: 500 } as Response)) as unknown as typeof fetch;
  await entregarWebhooksPendientes(conPlataforma, { fetchImpl: stub500, limite: 20 });
  const fila = await conPlataforma(async (c) => (await c.query(
    "select estado, intentos from plataforma.webhook_entregas where cliente_id=$1", [C])).rows[0]);
  expect(fila.estado).toBe("pendiente");
  expect(fila.intentos).toBe(1);
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
