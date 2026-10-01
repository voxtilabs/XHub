import { test, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { esCifrado, _cifrarCon, _descifrarCon, _huella } from "../src/cripto.js";

const M1 = randomBytes(32);
const M2 = randomBytes(32);
const SECRETO = "clave-de-prueba-no-real-123";

test("roundtrip: cifra y descifra con la misma maestra", () => {
  const sobre = _cifrarCon(SECRETO, M1);
  expect(esCifrado(sobre)).toBe(true);
  expect(_descifrarCon(sobre, [M1])).toBe(SECRETO);
});

test("anti-fuga: el sobre NO contiene el secreto en claro (ni base64)", () => {
  const sobre = _cifrarCon(SECRETO, M1);
  expect(sobre).not.toContain(SECRETO);
  expect(sobre).not.toContain(Buffer.from(SECRETO).toString("base64"));
  // dos cifrados del mismo secreto dan sobres distintos (iv/clave de datos aleatorios)
  expect(_cifrarCon(SECRETO, M1)).not.toBe(_cifrarCon(SECRETO, M1));
});

test("una maestra equivocada NO descifra", () => {
  const sobre = _cifrarCon(SECRETO, M1);
  expect(() => _descifrarCon(sobre, [M2])).toThrow(); // ninguna huella coincide
});

test("rotación: re-envolver con la nueva maestra; descifra con la nueva", () => {
  const sobre1 = _cifrarCon(SECRETO, M1);
  // simula reenvolver: abrir con M1, cerrar con M2
  const abierto = _descifrarCon(sobre1, [M1]);
  const sobre2 = _cifrarCon(abierto, M2);
  expect(_descifrarCon(sobre2, [M2])).toBe(SECRETO);
  // durante la transición, con ambas maestras disponibles, cualquiera de los dos sobres abre
  expect(_descifrarCon(sobre1, [M2, M1])).toBe(SECRETO);
  expect(_descifrarCon(sobre2, [M2, M1])).toBe(SECRETO);
});

test("manipular el ciphertext rompe la verificación (GCM)", () => {
  const sobre = _cifrarCon(SECRETO, M1);
  const json = JSON.parse(Buffer.from(sobre.slice("enc:v1:".length), "base64").toString());
  const ct = Buffer.from(json.ct, "base64"); ct[0] ^= 0xff; json.ct = ct.toString("base64");
  const manipulado = "enc:v1:" + Buffer.from(JSON.stringify(json)).toString("base64");
  expect(() => _descifrarCon(manipulado, [M1])).toThrow();
});

test("la huella distingue maestras", () => {
  expect(_huella(M1)).not.toBe(_huella(M2));
  expect(_huella(M1)).toBe(_huella(Buffer.from(M1)));
});
