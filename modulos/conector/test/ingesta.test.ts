import { test, expect } from "vitest";
import { ProveedorFixtures } from "../src/proveedor-fixtures.js";
import { sincronizarLlamadas, type NucleoIngesta } from "../src/ingesta.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// núcleo falso en memoria: una persona por teléfono, interacciones dedup por dedupeId
function nucleoFalso() {
  const personas = new Map<string, string>();
  const interacciones: any[] = [];
  const vistos = new Set<string>();
  const api: NucleoIngesta = {
    async asegurarPersona(_c, _canal, valor) {
      if (!personas.has(valor)) personas.set(valor, `p-${personas.size + 1}`);
      return { id: personas.get(valor)! };
    },
    async registrarInteraccion(_c, e) {
      if (e.dedupeId && vistos.has(e.dedupeId)) return { duplicado: true };  // simula la unicidad del núcleo
      if (e.dedupeId) vistos.add(e.dedupeId);
      interacciones.push(e);
      return { id: `i-${interacciones.length}` };
    },
  };
  return { api, personas, interacciones };
}

// registros con forma de XContact (SINTÉTICOS: la instancia demo no tenía llamadas)
const ENVOLTORIO = {
  error: false, total: 2, dados: [
    { id: 5001, numero: "912345678", sentido: "entrante", status: "Atendida", duracao: 132, agente: "Camila R.", fila: "Soporte", data: "2026-09-20 10:15:00" },
    { id: 5002, numero: null, sentido: "saliente", status: "Abandonada", duracao: 0, agente: null, fila: "Ventas", data: "2026-09-20 11:00:00" },
  ],
};

test("ingesta: mapea, crea persona por teléfono y registra la interacción en la línea de tiempo", async () => {
  const { api, personas, interacciones } = nucleoFalso();
  const prov = new ProveedorFixtures({ llamadas: ENVOLTORIO });
  const r = await sincronizarLlamadas(null as any, prov, api, { desde: "2026-09-20", hasta: "2026-09-20" });
  expect(r).toEqual({ leidas: 2, ingestadas: 1, sinTelefono: 1 });   // la 2ª no tiene teléfono
  expect(personas.get("+56912345678")).toBeTruthy();
  expect(interacciones[0]).toMatchObject({ tipo: "llamada", moduloOrigen: "conector", objetoId: "5001", dedupeId: "xc:llamada:5001" });
  expect(interacciones[0].meta).toMatchObject({ sentido: "entrante", estado: "atendida", duracionSeg: 132 });
});

test("ingesta idempotente: reprocesar el mismo rango no duplica (dedupeId)", async () => {
  const { api, interacciones } = nucleoFalso();
  const prov = new ProveedorFixtures({ llamadas: ENVOLTORIO });
  await sincronizarLlamadas(null as any, prov, api, { desde: "2026-09-20", hasta: "2026-09-20" });
  await sincronizarLlamadas(null as any, prov, api, { desde: "2026-09-20", hasta: "2026-09-20" });
  expect(interacciones.length).toBe(1);  // la segunda pasada no agrega nada
});

test("el fixture REAL grabado (dados vacío) se procesa sin romper", async () => {
  const real = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "v4", "GET_v4_filas_ligacoes.json"), "utf8"));
  const prov = new ProveedorFixtures({ llamadas: real });
  const { api, interacciones } = nucleoFalso();
  const r = await sincronizarLlamadas(null as any, prov, api, { desde: "2026-09-20", hasta: "2026-09-20" });
  expect(r).toEqual({ leidas: 0, ingestadas: 0, sinTelefono: 0 });
  expect(interacciones.length).toBe(0);
});
