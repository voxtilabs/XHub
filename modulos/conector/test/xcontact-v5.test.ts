import { test, expect } from "vitest";
import { mapearContactoV5 } from "../src/xcontact-v5.js";

test("teléfono → identidad primaria E.164, y la identidad xcontact va SIEMPRE", () => {
  const c = mapearContactoV5({ id: 88, nome: "Juan Pérez", numero: "912345678" })!;
  expect(c).toMatchObject({ externoId: "88", nombre: "Juan Pérez", canal: "telefono", identidad: "+56912345678" });
  expect(c.identidades).toEqual(expect.arrayContaining([
    { canal: "telefono", valor: "+56912345678" },
    { canal: "xcontact", valor: "88" },
  ]));
});

test("emparejamiento por identidad, nunca por nombre; primaria = primera no-xcontact", () => {
  expect(mapearContactoV5({ id: 1, nome: "A", numero: "", email: "a@x.cl" })?.canal).toBe("email");
  expect(mapearContactoV5({ id: 2, nome: "B", numero: "-", documento: "12345678-5" })?.canal).toBe("rut");
  // sin ninguna identidad de canal real: cuelga del id externo
  expect(mapearContactoV5({ id: 3, nome: "C", numero: "" })).toMatchObject({ canal: "xcontact", identidad: "3" });
});

test("teléfonos y emails adicionales entran como identidades extra", () => {
  const c = mapearContactoV5({ id: 9, numero: "911111111", clienteNumerosAdicionais: [{ numero: "922222222" }], clienteEmailsAdicionais: [{ email: "ADIC@x.CL" }] })!;
  expect(c.identidades).toEqual(expect.arrayContaining([
    { canal: "telefono", valor: "+56911111111" },
    { canal: "telefono", valor: "+56922222222" },
    { canal: "email", valor: "adic@x.cl" },
    { canal: "xcontact", valor: "9" },
  ]));
});

test("grupos → etiquetas; campos adicionales → campos; sin duplicar identidades", () => {
  const c = mapearContactoV5({ id: 7, numero: "911111111", clienteGrupos: [{ id: 1, nome: "VIP" }], clienteCamposAdicionais: [{ nome: "Ciudad", valor: "Santiago" }] })!;
  expect(c.etiquetas).toEqual(["VIP"]);
  expect(c.campos).toEqual([{ nombre: "Ciudad", valor: "Santiago" }]);
});

test("fila sin identidad alguna se descarta", () => {
  expect(mapearContactoV5({ id: "", numero: "" })).toBeNull();
});
