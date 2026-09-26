import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente, lineaDeTiempo, asegurarPersonaPorIdentidad } from "@xhub/modulo-nucleo";
import { validarDefinicion } from "@xhub/sdk-modulo";
import { crearTicket, asignarTicket, cambiarEstado, agregarMensaje, resumirConversacion, listarBandeja, puedeTransicionar, definicion } from "../src/index.js";
import { join } from "node:path";

let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Tickets SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("la definición cumple el SDK", () => { expect(() => validarDefinicion(definicion)).not.toThrow(); });

test("crear ticket: la persona y la historia van al núcleo, el ticket es del módulo", async () => {
  const t = await conCliente(A, (c) => crearTicket(c, { canal: "email", identidad: "cli@x.cl", asunto: "Problema con despacho", canalOrigen: "email", cuerpo: "No llegó mi pedido" }));
  expect(t.numero).toBe("1");
  expect(t.estado).toBe("nuevo");
  // la apertura quedó en la línea de tiempo del NÚCLEO
  const persona = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "cli@x.cl"));
  const tl = await conCliente(A, (c) => lineaDeTiempo(c, persona.id, undefined, 10));
  expect(tl.datos.some((i) => i.objeto_tipo === "ticket")).toBe(true);
});

test("correlativo por cliente avanza", async () => {
  const t2 = await conCliente(A, (c) => crearTicket(c, { canal: "email", identidad: "otro@x.cl", asunto: "Otra cosa" }));
  expect(Number(t2.numero)).toBeGreaterThan(1);
});

test("estados de proceso: transiciones válidas e inválidas", async () => {
  const t = await conCliente(A, (c) => crearTicket(c, { canal: "webchat", identidad: "w1", asunto: "Estado" }));
  await conCliente(A, (c) => cambiarEstado(c, t.id, "abierto"));
  const res = await conCliente(A, (c) => cambiarEstado(c, t.id, "resuelto"));
  expect(res.estado).toBe("resuelto");
  // nuevo→resuelto directo es inválido
  const t2 = await conCliente(A, (c) => crearTicket(c, { canal: "webchat", identidad: "w2", asunto: "X" }));
  await expect(conCliente(A, (c) => cambiarEstado(c, t2.id, "resuelto"))).rejects.toMatchObject({ codigo: "CONFLICTO" });
  expect(puedeTransicionar("nuevo", "resuelto")).toBe(false);
});

test("asignar a un usuario", async () => {
  const t = await conCliente(A, (c) => crearTicket(c, { canal: "email", identidad: "asig@x.cl", asunto: "Asignar" }));
  const agente = "11111111-1111-1111-1111-111111111111";
  await conCliente(A, (c) => asignarTicket(c, t.id, agente));
  const bandeja = await conCliente(A, (c) => listarBandeja(c, { asignadoA: agente }));
  expect(bandeja.datos.some((x) => x.id === t.id)).toBe(true);
});

test("resumen de conversación toma los mensajes no internos", async () => {
  const t = await conCliente(A, (c) => crearTicket(c, { canal: "telefono", identidad: "+56912345678", canalOrigen: "whatsapp", asunto: "Consulta", cuerpo: "Hola, mi pedido no llegó" }));
  await conCliente(A, (c) => agregarMensaje(c, t.id, { autorTipo: "agente", cuerpo: "Estamos revisando", interno: false }));
  await conCliente(A, (c) => agregarMensaje(c, t.id, { autorTipo: "agente", cuerpo: "OJO: cliente molesto", interno: true }));
  const resumen = await conCliente(A, (c) => resumirConversacion(c, t.id));
  expect(resumen).toContain("Motivo inicial");
  // la nota interna no cuenta como mensaje del cliente pero sí existe
  const g = await conCliente(A, (c) => c.query("select count(*)::int n from tickets_mensajes where ticket_id=$1", [t.id]));
  expect(g.rows[0].n).toBe(3);
});

test("bandeja filtra por estado y pagina", async () => {
  const b = await conCliente(A, (c) => listarBandeja(c, { estado: "nuevo" }, undefined, 2));
  expect(b.datos.every((t) => t.estado === "nuevo")).toBe(true);
});

test("no cruza clientes", async () => {
  const B = (await conPlataforma((c) => crearCliente(c, "Otro Tickets"))).id;
  const t = await conCliente(A, (c) => crearTicket(c, { canal: "email", identidad: "solo-a@x.cl", asunto: "Solo A" }));
  const bandejaB = await conCliente(B, (c) => listarBandeja(c, {}));
  expect(bandejaB.datos.some((x) => x.id === t.id)).toBe(false);
});
