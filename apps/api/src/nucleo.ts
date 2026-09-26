import type { NucleoApi } from "@xhub/sdk-modulo";
import { asegurarPersonaPorIdentidad, registrarInteraccion, enlazar } from "@xhub/modulo-nucleo";

/** Composición: expone el núcleo real como la NucleoApi que consumen los módulos. */
export const nucleo: NucleoApi = {
  asegurarPersona: (c, canal, valor, nombre) => asegurarPersonaPorIdentidad(c, canal as never, valor, nombre),
  registrarInteraccion: async (c, e) => { const r = await registrarInteraccion(c, e as never); return { id: (r as { id: string }).id }; },
  enlazar: (c, ot, oi, te, dt, di) => enlazar(c, ot, oi, te, dt, di),
};
