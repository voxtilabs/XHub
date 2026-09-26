import { test, expect } from "vitest";
import { Cortacircuitos, BaldeDeFichas, clasificarError, esReintentable } from "../src/resiliencia.js";

test("cortacircuitos abre tras N fallos y no deja llamar", () => {
  let t = 0; const cc = new Cortacircuitos({ umbralFallos: 3, enfriamientoMs: 1000 }, () => t);
  expect(cc.puedeLlamar()).toBe(true);
  cc.registrarFallo(); cc.registrarFallo(); cc.registrarFallo();
  expect(cc.estadoActual).toBe("abierto");
  expect(cc.puedeLlamar()).toBe(false);
});

test("cortacircuitos pasa a medio tras el enfriamiento y se cierra con un éxito", () => {
  let t = 0; const cc = new Cortacircuitos({ umbralFallos: 2, enfriamientoMs: 1000 }, () => t);
  cc.registrarFallo(); cc.registrarFallo();
  t = 1000;
  expect(cc.puedeLlamar()).toBe(true);   // medio
  cc.registrarExito();
  expect(cc.estadoActual).toBe("cerrado");
});

test("balde de fichas limita la ráfaga y rellena con el tiempo", () => {
  let t = 0; const b = new BaldeDeFichas(2, 1, () => t); // cap 2, 1/seg
  expect(b.tomar()).toBe(true);
  expect(b.tomar()).toBe(true);
  expect(b.tomar()).toBe(false);   // agotado
  t = 1000;                        // pasa 1 seg → 1 ficha
  expect(b.tomar()).toBe(true);
  expect(b.tomar()).toBe(false);
});

test("clasificar errores de XContact y decidir reintento", () => {
  expect(clasificarError(500, "")).toBe("transitorio");
  expect(clasificarError(429, "")).toBe("transitorio");
  expect(clasificarError(403, "")).toBe("permiso");
  expect(clasificarError(422, "there are no references to vCliente")).toBe("contrato");
  expect(clasificarError(400, "campo x")).toBe("dato");
  expect(clasificarError(0, "")).toBe("caida");
  expect(esReintentable("transitorio")).toBe(true);
  expect(esReintentable("permiso")).toBe(false);
  expect(esReintentable("caida")).toBe(true);
});
