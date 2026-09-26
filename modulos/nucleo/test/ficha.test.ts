import { test, expect, beforeAll, afterAll } from "vitest";
import { cerrarPool, conCliente, conPlataforma, cargarDe, migrar } from "@xhub/db";
import { crearCliente } from "../src/clientes.js";
import { asegurarPersonaPorIdentidad, adjuntarIdentidad } from "../src/personas.js";
import { registrarInteraccion } from "../src/interacciones.js";
import { fusionarPersonas } from "../src/enlaces.js";
import { buscarPersonas, fichaDePersona } from "../src/ficha.js";
import { join } from "node:path";

let A = "", B = "";
beforeAll(async () => {
  await migrar(cargarDe(join(__dirname, "..", "..", "..", "packages", "db", "migrations")));
  A = (await conPlataforma((c) => crearCliente(c, "Ficha SA"))).id;
  B = (await conPlataforma((c) => crearCliente(c, "Otro SA"))).id;
});
afterAll(async () => { await cerrarPool(); });

test("búsqueda en español por nombre e identidad", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "maria.gonzalez@x.cl", "María González"));
  const porNombre = await conCliente(A, (c) => buscarPersonas(c, "maria gonzalez"));
  expect(porNombre.map((r) => r.personaId)).toContain(p.id);
  const porEmail = await conCliente(A, (c) => buscarPersonas(c, "maria.gonzalez@x.cl"));
  expect(porEmail.map((r) => r.personaId)).toContain(p.id);
});

test("la búsqueda no cruza clientes", async () => {
  await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "secreto@a.cl", "Secreto A"));
  const desdeB = await conCliente(B, (c) => buscarPersonas(c, "Secreto"));
  expect(desdeB.length).toBe(0);
});

test("búsqueda excluye personas fusionadas", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "dup1@x.cl", "Pedro Dup"));
  const p2 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "pedro-web", "Pedro Dup"));
  await conCliente(A, (c) => fusionarPersonas(c, p1.id, p2.id));
  const r = await conCliente(A, (c) => buscarPersonas(c, "Pedro Dup"));
  // solo aparece la superviviente, no la absorbida
  expect(r.map((x) => x.personaId)).toContain(p1.id);
  expect(r.map((x) => x.personaId)).not.toContain(p2.id);
});

test("ficha de una absorbida redirige a la superviviente", async () => {
  const p1 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "red1@x.cl"));
  const p2 = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "red2"));
  await conCliente(A, (c) => fusionarPersonas(c, p1.id, p2.id));
  const ficha = await conCliente(A, (c) => fichaDePersona(c, p2.id)); // pido la absorbida
  expect(ficha.persona.id).toBe(p1.id); // responde la superviviente
});

test("ficha de persona de otro cliente → NO_ENCONTRADO (sin fuga)", async () => {
  const p = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "email", "solo-a@x.cl"));
  await expect(conCliente(B, (c) => fichaDePersona(c, p.id))).rejects.toMatchObject({ codigo: "NO_ENCONTRADO" });
});

// TEST CORONA — criterio de salida de la Fase 2
test("CRITERIO: con solo núcleo, encender un módulo después NO migra nada", async () => {
  // (a) Con SOLO núcleo: una persona escribe por webchat y luego por email
  const persona = await conCliente(A, (c) => asegurarPersonaPorIdentidad(c, "webchat", "corona-sesion", "Cliente Corona"));
  await conCliente(A, (c) => adjuntarIdentidad(c, persona.id, "email", "corona@x.cl"));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: persona.id, tipo: "webchat", moduloOrigen: "nucleo", resumen: "hola por chat" }));
  await conCliente(A, (c) => registrarInteraccion(c, { personaId: persona.id, tipo: "email", moduloOrigen: "nucleo", resumen: "y por correo" }));

  const antes = await conCliente(A, (c) => fichaDePersona(c, persona.id));
  expect(antes.lineaDeTiempo.length).toBe(2);
  const seqsAntes = antes.lineaDeTiempo.map((i) => i.seq);

  // (b) "Encender xTickets": el módulo registra una interacción con objeto_tipo='ticket'
  // apuntando al MISMO persona_id. NO hay migración de datos del núcleo.
  await conCliente(A, (c) => registrarInteraccion(c, {
    personaId: persona.id, tipo: "ticket.creado", moduloOrigen: "tickets",
    objetoTipo: "ticket", objetoId: "TK-1", resumen: "abrió un ticket" }));

  const despues = await conCliente(A, (c) => fichaDePersona(c, persona.id));
  // (1) la persona es la MISMA (no se recreó)
  expect(despues.persona.id).toBe(persona.id);
  // (2) las interacciones previas conservan su seq/id, sin un solo UPDATE
  const seqsDespues = despues.lineaDeTiempo.map((i) => i.seq);
  for (const s of seqsAntes) expect(seqsDespues).toContain(s);
  // (3) la ficha ahora SUMA el ticket a la historia previa intacta
  expect(despues.lineaDeTiempo.length).toBe(3);
  expect(despues.lineaDeTiempo.some((i) => i.objeto_tipo === "ticket")).toBe(true);
  // la historia ya estaba: no hubo migración
});
