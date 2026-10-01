import { test, expect } from "vitest";
import { mapearContactoV5, leerContactosV5 } from "../src/xcontact-v5.js";

// fetch simulado: responde el login v5 y /clientes con filas dadas.
function fetchV5(rows: Record<string, unknown>[]): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes("/auth/supervisor")) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "tok", expiresIn: "1h" }) } as Response;
    if (u.includes("/clientes")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: rows }) } as Response;
    return { ok: false, status: 404, text: async () => "" } as Response;
  }) as unknown as typeof fetch;
}

test("#59 sondeo incremental: desde=cursor devuelve SOLO ids nuevos, ordenados asc", async () => {
  const filas = [{ id: 5, numero: "911111111" }, { id: 2, numero: "922222222" }, { id: 9, numero: "933333333" }];
  const opts = { host: "h", usuario: "u", clave: "c", fetchImpl: fetchV5(filas) };
  const todos = await leerContactosV5(opts);
  expect(todos.map((c) => c.externoId)).toEqual(["2", "5", "9"]); // ordenado ascendente por id
  const nuevos = await leerContactosV5({ ...opts, desde: "5" });
  expect(nuevos.map((c) => c.externoId)).toEqual(["9"]); // solo id > 5 → no reprocesa lo ya visto
  const ninguno = await leerContactosV5({ ...opts, desde: "9" });
  expect(ninguno).toEqual([]); // cursor al día → nada nuevo (no duplica)
});

test("#59 el límite recorta tras filtrar por cursor (lote reanudable)", async () => {
  const filas = [{ id: 1, numero: "911111111" }, { id: 2, numero: "922222222" }, { id: 3, numero: "933333333" }];
  const r = await leerContactosV5({ host: "h", usuario: "u", clave: "c", fetchImpl: fetchV5(filas), limite: 2 });
  expect(r.map((c) => c.externoId)).toEqual(["1", "2"]); // primeros 2 del orden asc → el cursor avanza a "2"
});

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

import { mapearTagV5 } from "../src/xcontact-v5.js";
test("mapea una tag v5 (nome + cor) y descarta las sin nombre", () => {
  expect(mapearTagV5({ id: 1, nome: "Cotizacion", cor: "#ff0000" })).toEqual({ nombre: "Cotizacion", color: "#ff0000" });
  expect(mapearTagV5({ id: 2, nome: "  " })).toBeNull();
});

test("facebookID → identidad messenger; isBusiness → etiqueta Empresa", () => {
  const c = mapearContactoV5({ id: 30, numero: "911111111", facebookID: "fb_9988", isBusiness: true })!;
  expect(c.identidades).toEqual(expect.arrayContaining([{ canal: "messenger", valor: "fb_9988" }]));
  expect(c.etiquetas).toContain("Empresa");
});
