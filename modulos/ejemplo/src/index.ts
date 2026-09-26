import type { PoolClient } from "pg";
import type { DefinicionModulo } from "@xhub/sdk-modulo";
import { asegurarPersonaPorIdentidad } from "@xhub/modulo-nucleo";
import { registrarInteraccion } from "@xhub/modulo-nucleo";

/**
 * Módulo de referencia. Prueba que el SDK sirve y es la plantilla de xTickets.
 * Demuestra la ley clave: guarda SU objeto (nota), pero la persona y la interacción
 * van al NÚCLEO — no tiene tabla de contactos propia.
 */
export const definicion: DefinicionModulo = {
  manifiesto: {
    nombre: "ejemplo",
    depende: ["nucleo"],
    permisos: ["ejemplo.leer", "ejemplo.crear"],
    eventos: ["ejemplo.nota_creada"],
  },
  migraciones: ["0010_ejemplo_notas.sql"],
  rutas: [
    { metodo: "POST", ruta: "/notas", scope: "ejemplo.crear" },
    { metodo: "GET", ruta: "/notas", scope: "ejemplo.leer" },
  ],
  consumidores: [
    // ejemplo: cuando una persona se fusiona, re-apuntar mis notas al superviviente
    {
      tipo: "persona.fusionada",
      consumidor: "ejemplo:reapuntar-notas",
      manejar: async (c, ev) => {
        const p = ev.payload as { principalId: string; duplicadaId: string };
        await c.query("update ejemplo_notas set persona_id=$1 where persona_id=$2 and cliente_id=$3",
          [p.principalId, p.duplicadaId, ev.clienteId]);
      },
    },
  ],
};

export interface Nota { id: string; persona_id: string; texto: string; }

/**
 * Crea una nota para una persona identificada por su canal. La persona la asegura
 * el NÚCLEO (no la crea el módulo); la interacción también va al núcleo. El módulo
 * solo es dueño de la fila de la nota.
 */
export async function crearNota(c: PoolClient, canal: string, valorIdentidad: string, texto: string): Promise<Nota> {
  // persona: del núcleo, no del módulo
  const persona = await asegurarPersonaPorIdentidad(c, canal as never, valorIdentidad);
  const r = await c.query(
    "insert into ejemplo_notas (cliente_id, persona_id, texto) values (nullif(current_setting('app.cliente_id',true),'')::uuid, $1, $2) returning id, persona_id, texto",
    [persona.id, texto]);
  // la historia queda en el núcleo, no en el módulo
  await registrarInteraccion(c, {
    personaId: persona.id, tipo: "ejemplo.nota", moduloOrigen: "ejemplo",
    objetoTipo: "nota", objetoId: r.rows[0].id, resumen: texto.slice(0, 80),
  });
  return r.rows[0];
}
