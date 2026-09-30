import { test, expect } from "vitest";
import { mapearContactoV5 } from "../src/xcontact-v5.js";

test("mapea un contacto v5 con teléfono → canal telefono (E.164)", () => {
  const c = mapearContactoV5({ id: 88, nome: "Juan Pérez", numero: "912345678", email: null, documento: null });
  expect(c).toMatchObject({ externoId: "88", nombre: "Juan Pérez", canal: "telefono", identidad: "+56912345678" });
});

test("sin teléfono usa email; sin email usa RUT; sin nada usa el id externo", () => {
  expect(mapearContactoV5({ id: 1, nome: "A", numero: "", email: "a@x.cl" })?.canal).toBe("email");
  expect(mapearContactoV5({ id: 2, nome: "B", numero: "-", email: null, documento: "12345678-5" })?.canal).toBe("rut");
  expect(mapearContactoV5({ id: 3, nome: "C", numero: "", email: null, documento: null })).toMatchObject({ canal: "xcontact", identidad: "3" });
});

test("email se normaliza (minúsculas) y exige @", () => {
  expect(mapearContactoV5({ id: 4, numero: "", email: "  JUAN@Empresa.CL " })?.identidad).toBe("juan@empresa.cl");
  expect(mapearContactoV5({ id: 5, numero: "", email: "no-es-email" })?.canal).toBe("xcontact");
});

test("una fila sin identidad alguna se descarta (null)", () => {
  expect(mapearContactoV5({ id: "", numero: "", email: null, documento: null })).toBeNull();
});
