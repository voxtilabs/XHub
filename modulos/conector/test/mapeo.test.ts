import { test, expect } from "vitest";
import { traducirEstadoLlamada, traducirFecha, telefonoE164, desenvolver } from "../src/mapeo.js";

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
