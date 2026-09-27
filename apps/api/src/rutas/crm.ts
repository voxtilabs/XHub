import type { FastifyInstance } from "fastify";
import { ErrorApi } from "@xhub/core";
import { conCliente } from "@xhub/db";
import { nucleo } from "../nucleo.js";
import { guard, exigir } from "./consola.js";

/**
 * Consola de xCRM (sesión). La oportunidad cuelga de la MISMA persona del núcleo, y su
 * creación/cierre se registra en nucleo.interacciones → aparece en la ficha 360 y en el
 * contexto omnicanal del ticket. Eso es "el ticket queda en el CRM y viceversa".
 */
export const ETAPAS = ["Prospecto", "Calificado", "Propuesta", "Negociación", "Cierre"];

export function registrarConsolaCrm(app: FastifyInstance): void {
  app.register(async (r) => {
    // Embudo: oportunidades abiertas (+ ganadas recientes) con la persona resuelta.
    r.get("/oportunidades", async (req) => {
      const ctx = await guard(req); exigir(ctx, "crm.ver");
      return conCliente(ctx.clienteId, async (c) => {
        const q = await c.query(
          `select o.id, o.titulo, o.valor::int as valor, o.etapa, o.estado, o.persona_id, o.creado_en,
                  (select identificador from nucleo.identidades i where i.persona_id=o.persona_id and i.canal='email' limit 1) as persona_email
             from crm_oportunidades o where o.estado <> 'perdida' order by o.creado_en desc limit 200`);
        const abiertas = q.rows.filter((x) => x.estado === "abierta");
        const valorAbierto = abiertas.reduce((a, x) => a + Number(x.valor), 0);
        const ganadas = (await c.query("select count(*)::int n, coalesce(sum(valor),0)::int v from crm_oportunidades where estado='ganada'")).rows[0];
        return { datos: q.rows, etapas: ETAPAS, resumen: { abiertas: abiertas.length, valorAbierto, ganadas: ganadas.n, valorGanado: ganadas.v }, puede: { gestionar: ctx.esAdmin || ctx.permisos.includes("crm.gestionar") } };
      });
    });

    // Crear oportunidad para una persona (por canal+identidad). Registra interacción.
    r.post("/oportunidades", async (req) => {
      const ctx = await guard(req); exigir(ctx, "crm.gestionar");
      const b = req.body as { canal?: string; identidad?: string; titulo?: string; valor?: number; etapa?: string };
      if (!b?.canal || !b?.identidad || !b?.titulo?.trim()) throw new ErrorApi("VALIDACION", "Faltan canal, identidad o título");
      const etapa = b.etapa && ETAPAS.includes(b.etapa) ? b.etapa : ETAPAS[0];
      return conCliente(ctx.clienteId, async (c) => {
        const persona = await nucleo.asegurarPersona(c, b.canal!, b.identidad!);
        const o = (await c.query(
          "insert into crm_oportunidades (cliente_id, persona_id, titulo, valor, etapa) values ($1,$2,$3,$4,$5) returning id, titulo, valor::int as valor, etapa, estado, persona_id, creado_en",
          [ctx.clienteId, persona.id, b.titulo!.trim(), Math.max(0, Number(b.valor) || 0), etapa])).rows[0];
        await nucleo.registrarInteraccion(c, { personaId: persona.id, tipo: "oportunidad.creada", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Oportunidad: ${o.titulo}` });
        return o;
      });
    });

    // Mover de etapa (kanban).
    r.put("/oportunidades/:id/etapa", async (req) => {
      const ctx = await guard(req); exigir(ctx, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { etapa?: string };
      if (!b?.etapa || !ETAPAS.includes(b.etapa)) throw new ErrorApi("VALIDACION", "Etapa inválida");
      const r2 = await conCliente(ctx.clienteId, (c) => c.query("update crm_oportunidades set etapa=$2, actualizado_en=now() where id=$1 and estado='abierta' returning id", [id, b.etapa]));
      if (r2.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada o cerrada");
      return { ok: true, etapa: b.etapa };
    });

    // Cerrar (ganada / perdida). Registra interacción en la historia de la persona.
    r.put("/oportunidades/:id/cerrar", async (req) => {
      const ctx = await guard(req); exigir(ctx, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { estado?: string };
      if (b?.estado !== "ganada" && b?.estado !== "perdida") throw new ErrorApi("VALIDACION", "Estado inválido (ganada|perdida)");
      return conCliente(ctx.clienteId, async (c) => {
        const o = (await c.query("update crm_oportunidades set estado=$2, cerrada_en=now(), actualizado_en=now() where id=$1 returning id, persona_id, titulo, valor::int as valor", [id, b.estado])).rows[0];
        if (!o) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada");
        await nucleo.registrarInteraccion(c, { personaId: o.persona_id, tipo: `oportunidad.${b.estado}`, moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Oportunidad ${b.estado}: ${o.titulo}` });
        return { ok: true, estado: b.estado };
      });
    });
  }, { prefix: "/cliente" });
}
