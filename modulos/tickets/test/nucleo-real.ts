import type { NucleoApi } from "@xhub/sdk-modulo";
import { asegurarPersonaPorIdentidad, registrarInteraccion, enlazar } from "@xhub/modulo-nucleo";

/** Adaptador: expone el núcleo real como NucleoApi para el módulo. En producción
 *  esta composición vive en apps/api; aquí la usamos para probar la integración real. */
export const nucleoReal: NucleoApi = {
  asegurarPersona: (c, canal, valor, nombre) => asegurarPersonaPorIdentidad(c, canal as never, valor, nombre),
  registrarInteraccion: async (c, e) => { const r = await registrarInteraccion(c, e as never); return { id: (r as { id: string }).id }; },
  enlazar: (c, ot, oi, te, dt, di) => enlazar(c, ot, oi, te, dt, di),
};
