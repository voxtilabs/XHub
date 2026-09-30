import { test, expect } from "vitest";
import { recorrerKeyset } from "../src/paginacion.js";

// Fuente falsa: 25 elementos con clave "id" creciente, paginada por keyset.
function fuente() {
  const datos = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1).padStart(3, "0"), n: i + 1 }));
  const llamadas: number[] = [];
  const traer = async (despuesDe: string | null, limite: number) => {
    llamadas.push(1);
    const desde = datos.filter((d) => despuesDe === null || d.id > despuesDe);
    return desde.slice(0, limite);
  };
  return { datos, traer, paginas: () => llamadas.length };
}

test("#52: recorre todo, cada elemento EXACTAMENTE una vez", async () => {
  const f = fuente();
  const vistos: string[] = [];
  const r = await recorrerKeyset({ traer: f.traer, clave: (x) => x.id, limite: 10, alProcesar: (x) => { vistos.push(x.id); } });
  expect(r.procesados).toBe(25);
  expect(vistos.length).toBe(25);
  expect(new Set(vistos).size).toBe(25); // sin duplicados
  expect(vistos[0]).toBe("001"); expect(vistos[24]).toBe("025");
});

test("#52: una interrupción a mitad se reanuda desde el cursor SIN duplicar", async () => {
  const f = fuente();
  const vistos: string[] = [];
  // primera corrida: se "corta" tras 12 (simulamos parando y guardando el cursor)
  let cursor: string | null = null; let cnt = 0;
  await recorrerKeyset({ traer: f.traer, clave: (x) => x.id, limite: 5, alProcesar: (x) => { if (cnt < 12) { vistos.push(x.id); cursor = x.id; cnt++; } else throw new Error("corte"); } }).catch(() => {});
  expect(vistos.length).toBe(12); expect(cursor).toBe("012");
  // reanuda desde el cursor: debe procesar 13..25, nada repetido
  const r2 = await recorrerKeyset({ traer: f.traer, clave: (x) => x.id, limite: 5, desde: cursor, alProcesar: (x) => { vistos.push(x.id); } });
  expect(r2.procesados).toBe(13);
  expect(new Set(vistos).size).toBe(25); // 25 únicos en total, cero duplicados
});
