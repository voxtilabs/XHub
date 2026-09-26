import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar, emitir, tomarPendientes, marcarProcesado } from "@xhub/db";
import { crearCliente } from "@xhub/modulo-nucleo";
import { fijarConfigTriage } from "../src/triage.js";
import { crearConsumidorTriage } from "../src/consumidor.js";
import { nucleoReal } from "./nucleo-real.js";
import { join } from "node:path";

const consumidor = crearConsumidorTriage(nucleoReal);
let A = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Conector SA"))).id;
  await conCliente(A, (c) => fijarConfigTriage(c, A, { modo: "automatico", umbral: 0.7 }));
});
afterAll(async () => { await cerrarPool(); });

test("FLUJO XContact→xTickets por evento: una conversación con problema crea ticket", async () => {
  // el conector emite el evento (aquí simulamos la emisión)
  await conCliente(A, (c) => emitir(c, {
    clienteId: A, modulo: "conector", tipo: "conversacion.terminada",
    payload: { canal: "telefono", identidad: "+56911112222", dedupeId: "xc-conv-1",
      mensajes: [{ autor: "cliente", texto: "Compré un producto y llegó fallado, quiero reclamo" }] },
  }));
  // el despachador toma el evento y lo pasa al consumidor de triage
  const res = await conCliente(A, async (c) => {
    const [ev] = await tomarPendientes(c, ["conector"], 10);
    const r = await consumidor.manejar(c, { clienteId: A, payload: ev.payload as never });
    await marcarProcesado(c, ev.id);
    return r;
  });
  expect(res.accion).toBe("creado");
  expect(res.ticketId).toBeDefined();
});

test("una consulta simple NO crea ticket (no inunda la cola)", async () => {
  await conCliente(A, (c) => emitir(c, {
    clienteId: A, modulo: "conector", tipo: "conversacion.terminada",
    payload: { canal: "webchat", identidad: "sesion-9", dedupeId: "xc-conv-2",
      mensajes: [{ autor: "cliente", texto: "¿A qué hora abren?" }, { autor: "agente", texto: "10 a 18h" }, { autor: "cliente", texto: "gracias" }] },
  }));
  const res = await conCliente(A, async (c) => {
    const evs = await tomarPendientes(c, ["conector"], 10);
    const ev = evs.find((e) => (e.payload as { dedupeId: string }).dedupeId === "xc-conv-2")!;
    const r = await consumidor.manejar(c, { clienteId: A, payload: ev.payload as never });
    await marcarProcesado(c, ev.id);
    return r;
  });
  expect(res.accion).toBe("descartado");
  expect(res.ticketId).toBeUndefined();
});

test("el consumidor declara su tipo y nombre (entrega única)", () => {
  expect(consumidor.tipo).toBe("conversacion.terminada");
  expect(consumidor.consumidor).toBe("tickets:triage-conversacion");
});
