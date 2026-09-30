import { test, expect } from "vitest";
import { traducirEstadoLlamada, traducirFecha, telefonoE164, desenvolver, diaDelNegocio } from "../src/mapeo.js";

test("estados de llamada traducen del portugués al vocabulario nuestro", () => {
  expect(traducirEstadoLlamada("Atendida")).toBe("atendida");
  expect(traducirEstadoLlamada("Transbordou")).toBe("transferida");
  expect(traducirEstadoLlamada("Não atendida")).toBe("no_atendida");
  expect(() => traducirEstadoLlamada("Xyz")).toThrow(/desconocido/);
});

test("fecha de XContact (hora Chile sin offset) → ISO absoluto correcto", () => {
  // 2026-01-15 12:00:00 en Chile (verano, -03) = 15:00 UTC
  expect(traducirFecha("2026-01-15 12:00:00")).toBe("2026-01-15T15:00:00.000Z");
  // 2026-07-15 12:00:00 en Chile (invierno, -04) = 16:00 UTC
  expect(traducirFecha("2026-07-15 12:00:00")).toBe("2026-07-15T16:00:00.000Z");
  expect(() => traducirFecha("basura")).toThrow(/ilegible/);
});

test("teléfono a E.164, o null si no se puede", () => {
  expect(telefonoE164("912345678")).toBe("+56912345678");
  expect(telefonoE164("56912345678")).toBe("+56912345678");
  expect(telefonoE164("123")).toBeNull();
  expect(telefonoE164(null)).toBeNull();
});

test("desenvolver lee {dados,total}", () => {
  expect(desenvolver({ dados: [1, 2], total: 2 })).toEqual({ datos: [1, 2], total: 2 });
  expect(desenvolver({})).toEqual({ datos: [], total: 0 });
});

test("mapearLlamada traduce un registro de XContact al vocabulario nuestro", async () => {
  const { mapearLlamada } = await import("../src/mapeo.js");
  const ll = mapearLlamada({ id: 5001, numero: "912345678", sentido: "entrante", status: "Atendida", duracao: 132, agente: "Camila R.", fila: "Soporte", data: "2026-09-20 10:15:00" });
  expect(ll.id).toBe("5001");
  expect(ll.personaTelefono).toBe("+56912345678");
  expect(ll.sentido).toBe("entrante");
  expect(ll.estado).toBe("atendida");
  expect(ll.duracionSeg).toBe(132);
  expect(ll.agente).toBe("Camila R.");
});

test("mapearLlamada LANZA si falta lo esencial (no inventa datos)", async () => {
  const { mapearLlamada } = await import("../src/mapeo.js");
  expect(() => mapearLlamada({ numero: "912345678" } as any)).toThrow(/confirmar el contrato/);
});

test("día del negocio: 22:30 en Chile cae en su día, no en el de UTC del día siguiente (#50)", () => {
  const iso = traducirFecha("2026-9-23 22:30:00");   // 22:30 hora Chile
  expect(diaDelNegocio(iso)).toBe("2026-09-23");      // el día del negocio es el 23
  expect(iso.slice(0, 10)).toBe("2026-09-24");        // pero el instante ISO ya cruzó a UTC del 24
});
