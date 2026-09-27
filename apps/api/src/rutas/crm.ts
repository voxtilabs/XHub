import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { ErrorApi } from "@xhub/core";
import { conCliente } from "@xhub/db";
import { nucleo } from "../nucleo.js";
import { guard, exigir } from "./consola.js";

/**
 * Consola de xCRM al estilo Pipedrive: pipelines con etapas configurables, deals con
 * campos ricos (moneda, cierre esperado, probabilidad, motivo de pérdida), actividades.
 * Todo sobre la espina dorsal: la oportunidad cuelga de la MISMA persona del núcleo.
 */
const ETAPAS_DEFAULT: [string, number][] = [
  ["Prospecto", 10], ["Contactado", 25], ["Reunido", 40],
  ["Visita agendada", 60], ["Visita realizada", 80], ["Reservado", 90],
];

/** Garantiza un pipeline por cliente (crea "Ventas" + etapas y migra las oportunidades viejas). */
async function asegurarPipeline(c: PoolClient, clienteId: string): Promise<string> {
  const ex = await c.query("select id from crm_pipelines order by orden asc limit 1");
  if (ex.rowCount) return ex.rows[0].id;
  const pl = (await c.query("insert into crm_pipelines (cliente_id, nombre, orden) values ($1,'Ventas',0) returning id", [clienteId])).rows[0].id;
  const etapas: { nombre: string; id: string }[] = [];
  let orden = 0;
  for (const [nombre, prob] of ETAPAS_DEFAULT) {
    const eid = (await c.query("insert into crm_etapas (cliente_id, pipeline_id, nombre, orden, probabilidad) values ($1,$2,$3,$4,$5) returning id", [clienteId, pl, nombre, orden, prob])).rows[0].id;
    etapas.push({ nombre, id: eid }); orden++;
  }
  const mapa = new Map(etapas.map((e) => [e.nombre.toLowerCase(), e.id]));
  const primera = etapas[0].id;
  const viejas = await c.query("select id, etapa from crm_oportunidades where pipeline_id is null");
  for (const o of viejas.rows) await c.query("update crm_oportunidades set pipeline_id=$2, etapa_id=$3 where id=$1", [o.id, pl, mapa.get(String(o.etapa || "").toLowerCase()) ?? primera]);
  return pl;
}

async function ctxGuard(req: FastifyRequest, permiso: string) { const ctx = await guard(req); exigir(ctx, permiso); return ctx; }

export function registrarConsolaCrm(app: FastifyInstance): void {
  app.register(async (r) => {
    // Pipelines + etapas del cliente (auto-crea el default).
    r.get("/crm/pipelines", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      return conCliente(ctx.clienteId, async (c) => {
        await asegurarPipeline(c, ctx.clienteId);
        const pls = (await c.query("select id, nombre, orden from crm_pipelines order by orden asc")).rows;
        const ets = (await c.query("select id, pipeline_id, nombre, orden, probabilidad from crm_etapas order by orden asc")).rows;
        return { datos: pls.map((p) => ({ ...p, etapas: ets.filter((e) => e.pipeline_id === p.id) })) };
      });
    });

    // Organizaciones (empresas).
    r.get("/crm/organizaciones", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      return conCliente(ctx.clienteId, async (c) => ({ datos: (await c.query(
        `select g.id, g.nombre, g.sitio_web, g.rubro, g.telefono,
                (select count(*)::int from crm_oportunidades o where o.org_id=g.id) as deals,
                (select coalesce(sum(o.valor),0)::int from crm_oportunidades o where o.org_id=g.id and o.estado='abierta') as valor_abierto
           from crm_organizaciones g order by g.nombre asc`)).rows }));
    });
    r.post("/crm/organizaciones", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const b = req.body as { nombre?: string; sitioWeb?: string; rubro?: string; telefono?: string };
      if (!b?.nombre?.trim()) throw new ErrorApi("VALIDACION", "La empresa necesita nombre");
      return conCliente(ctx.clienteId, async (c) => (await c.query(
        "insert into crm_organizaciones (cliente_id, nombre, sitio_web, rubro, telefono) values ($1,$2,$3,$4,$5) returning id, nombre, sitio_web, rubro, telefono",
        [ctx.clienteId, b.nombre!.trim(), b.sitioWeb?.trim() || null, b.rubro?.trim() || null, b.telefono?.trim() || null])).rows[0]);
    });
    r.get("/crm/organizaciones/:id", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const g = (await c.query("select id, nombre, sitio_web, rubro, telefono, direccion, creado_en from crm_organizaciones where id=$1", [id])).rows[0];
        if (!g) throw new ErrorApi("NO_ENCONTRADO", "Empresa no encontrada");
        const deals = (await c.query("select id, titulo, valor::int as valor, moneda, estado from crm_oportunidades where org_id=$1 order by creado_en desc", [id])).rows;
        return { ...g, deals };
      });
    });

    // Embudo de un pipeline: etapas + deals (abiertos + ganados) con la persona resuelta.
    r.get("/oportunidades", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      const q = req.query as { pipeline?: string };
      return conCliente(ctx.clienteId, async (c) => {
        const plId = q.pipeline || await asegurarPipeline(c, ctx.clienteId);
        const etapas = (await c.query("select id, nombre, orden, probabilidad from crm_etapas where pipeline_id=$1 order by orden asc", [plId])).rows;
        const ops = (await c.query(
          `select o.id, o.titulo, o.valor::int as valor, o.moneda, o.etapa_id, o.estado, o.persona_id, o.probabilidad, o.cierre_esperado, o.creado_en, o.org_id,
                  (select nombre from crm_organizaciones og where og.id=o.org_id) as org_nombre,
                  (select identificador from nucleo.identidades i where i.persona_id=o.persona_id and i.canal='email' limit 1) as persona_email
             from crm_oportunidades o where o.pipeline_id=$1 and o.estado <> 'perdida' order by o.creado_en desc limit 300`, [plId])).rows;
        const abiertas = ops.filter((o) => o.estado === "abierta");
        const valorAbierto = abiertas.reduce((a, o) => a + Number(o.valor), 0);
        const g = (await c.query("select count(*)::int n, coalesce(sum(valor),0)::int v from crm_oportunidades where estado='ganada' and pipeline_id=$1", [plId])).rows[0];
        return { datos: ops, etapas, pipelineId: plId, resumen: { abiertas: abiertas.length, valorAbierto, ganadas: g.n, valorGanado: g.v }, puede: { gestionar: ctx.esAdmin || ctx.permisos.includes("crm.gestionar") } };
      });
    });

    // INSIGHTS: forecast ponderado, valor por etapa, ganadas/perdidas, tasa de conversión.
    r.get("/crm/insights", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      return conCliente(ctx.clienteId, async (c) => {
        const plId = (req.query as { pipeline?: string }).pipeline || await asegurarPipeline(c, ctx.clienteId);
        const porEtapa = (await c.query(
          `select e.nombre, e.orden, e.probabilidad, count(o.id)::int n, coalesce(sum(o.valor),0)::int valor
             from crm_etapas e left join crm_oportunidades o on o.etapa_id=e.id and o.estado='abierta'
            where e.pipeline_id=$1 group by e.id, e.nombre, e.orden, e.probabilidad order by e.orden asc`, [plId])).rows;
        const fc = (await c.query("select coalesce(sum(valor * coalesce(probabilidad, (select probabilidad from crm_etapas e where e.id=o.etapa_id), 0) / 100.0),0)::int forecast from crm_oportunidades o where estado='abierta' and pipeline_id=$1", [plId])).rows[0];
        const g = (await c.query("select count(*)::int n, coalesce(sum(valor),0)::int v from crm_oportunidades where estado='ganada' and pipeline_id=$1", [plId])).rows[0];
        const p = (await c.query("select count(*)::int n from crm_oportunidades where estado='perdida' and pipeline_id=$1", [plId])).rows[0];
        const leads = (await c.query("select count(*)::int n from crm_leads where estado='activo'")).rows[0];
        const cerradas = g.n + p.n;
        return {
          forecast: fc.forecast,
          porEtapa,
          ganadas: { n: g.n, valor: g.v },
          perdidas: { n: p.n },
          tasaConversion: cerradas > 0 ? Math.round((g.n / cerradas) * 100) : 0,
          leadsActivos: leads.n,
        };
      });
    });

    // Detalle + actividades.
    r.get("/oportunidades/:id", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const o = (await c.query(
          `select o.id, o.titulo, o.valor::int as valor, o.moneda, o.etapa_id, o.estado, o.persona_id, o.probabilidad, o.cierre_esperado, o.motivo_perdida, o.creado_en, o.org_id,
                  (select nombre from crm_organizaciones og where og.id=o.org_id) as org_nombre,
                  (select nombre from crm_etapas e where e.id=o.etapa_id) as etapa,
                  (select identificador from nucleo.identidades i where i.persona_id=o.persona_id and i.canal='email' limit 1) as persona_email
             from crm_oportunidades o where o.id=$1`, [id])).rows[0];
        if (!o) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada");
        const actividades = (await c.query("select id, tipo, cuerpo, hecho, autor, creado_en from crm_actividades where oportunidad_id=$1 order by creado_en desc", [id])).rows;
        return { ...o, actividades, puede: { gestionar: ctx.esAdmin || ctx.permisos.includes("crm.gestionar") } };
      });
    });

    // Crear deal (Pipedrive: pipeline/etapa, moneda, cierre esperado, probabilidad).
    r.post("/oportunidades", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const b = req.body as { canal?: string; identidad?: string; titulo?: string; valor?: number; moneda?: string; pipelineId?: string; etapaId?: string; cierreEsperado?: string; probabilidad?: number; orgId?: string };
      if (!b?.canal || !b?.identidad || !b?.titulo?.trim()) throw new ErrorApi("VALIDACION", "Faltan canal, identidad o título");
      return conCliente(ctx.clienteId, async (c) => {
        const plId = b.pipelineId || await asegurarPipeline(c, ctx.clienteId);
        const etapaId = b.etapaId || (await c.query("select id from crm_etapas where pipeline_id=$1 order by orden asc limit 1", [plId])).rows[0]?.id;
        const persona = await nucleo.asegurarPersona(c, b.canal!, b.identidad!);
        const o = (await c.query(
          `insert into crm_oportunidades (cliente_id, persona_id, titulo, valor, moneda, pipeline_id, etapa_id, cierre_esperado, probabilidad, org_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, titulo, valor::int as valor, moneda, etapa_id, estado, persona_id, creado_en`,
          [ctx.clienteId, persona.id, b.titulo!.trim(), Math.max(0, Number(b.valor) || 0), b.moneda || "CLP", plId, etapaId, b.cierreEsperado || null, b.probabilidad ?? null, b.orgId || null])).rows[0];
        await nucleo.registrarInteraccion(c, { personaId: persona.id, tipo: "oportunidad.creada", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Oportunidad: ${o.titulo}` });
        return o;
      });
    });

    // Mover de etapa (kanban) — ahora por etapa_id; hereda la probabilidad de la etapa.
    r.put("/oportunidades/:id/etapa", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { etapaId?: string };
      if (!b?.etapaId) throw new ErrorApi("VALIDACION", "Falta la etapa");
      const r2 = await conCliente(ctx.clienteId, (c) => c.query(
        "update crm_oportunidades set etapa_id=$2, probabilidad=coalesce((select probabilidad from crm_etapas where id=$2), probabilidad), actualizado_en=now() where id=$1 and estado='abierta' returning id", [id, b.etapaId]));
      if (r2.rowCount === 0) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada o cerrada");
      return { ok: true };
    });

    // Cerrar (ganada / perdida) + motivo de pérdida (Pipedrive lost_reason).
    r.put("/oportunidades/:id/cerrar", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { estado?: string; motivo?: string };
      if (b?.estado !== "ganada" && b?.estado !== "perdida") throw new ErrorApi("VALIDACION", "Estado inválido (ganada|perdida)");
      return conCliente(ctx.clienteId, async (c) => {
        const o = (await c.query("update crm_oportunidades set estado=$2, motivo_perdida=$3, cerrada_en=now(), actualizado_en=now() where id=$1 returning id, persona_id, titulo", [id, b.estado, b.estado === "perdida" ? (b.motivo || null) : null])).rows[0];
        if (!o) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada");
        await nucleo.registrarInteraccion(c, { personaId: o.persona_id, tipo: `oportunidad.${b.estado}`, moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Oportunidad ${b.estado}: ${o.titulo}` });
        return { ok: true, estado: b.estado };
      });
    });

    // Actividades de la oportunidad (nota / llamada / reunión / tarea).
    r.post("/oportunidades/:id/actividades", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { tipo?: string; cuerpo?: string };
      const tipo = ["nota", "llamada", "reunion", "tarea"].includes(b?.tipo ?? "") ? b!.tipo! : "nota";
      if (!b?.cuerpo?.trim()) throw new ErrorApi("VALIDACION", "La actividad no puede ir vacía");
      return conCliente(ctx.clienteId, async (c) => (await c.query(
        "insert into crm_actividades (cliente_id, oportunidad_id, tipo, cuerpo, autor) values ($1,$2,$3,$4,$5) returning id, tipo, cuerpo, hecho, autor, creado_en",
        [ctx.clienteId, id, tipo, b.cuerpo!.trim(), ctx.usuarioId])).rows[0]);
    });
    r.put("/oportunidades/:id/actividades/:aid/hecho", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { aid } = req.params as { aid: string };
      const b = req.body as { hecho?: boolean };
      await conCliente(ctx.clienteId, (c) => c.query("update crm_actividades set hecho=$2 where id=$1", [aid, b?.hecho ?? true]));
      return { ok: true, hecho: b?.hecho ?? true };
    });

    // PRODUCTOS (catálogo del cliente).
    r.get("/crm/productos", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      return conCliente(ctx.clienteId, async (c) => ({ datos: (await c.query("select id, nombre, codigo, precio::int as precio, moneda from crm_productos order by nombre asc")).rows }));
    });
    r.post("/crm/productos", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const b = req.body as { nombre?: string; codigo?: string; precio?: number; moneda?: string };
      if (!b?.nombre?.trim()) throw new ErrorApi("VALIDACION", "El producto necesita nombre");
      return conCliente(ctx.clienteId, async (c) => (await c.query("insert into crm_productos (cliente_id, nombre, codigo, precio, moneda) values ($1,$2,$3,$4,$5) returning id, nombre, codigo, precio::int as precio, moneda",
        [ctx.clienteId, b.nombre!.trim(), b.codigo?.trim() || null, Math.max(0, Number(b.precio) || 0), b.moneda || "CLP"])).rows[0]);
    });

    // Line items del deal + recálculo del valor del deal.
    async function recalcularDeal(c: import("pg").PoolClient, oportunidadId: string) {
      await c.query("update crm_oportunidades set valor=coalesce((select sum(cantidad*precio) from crm_deal_productos where oportunidad_id=$1),valor), actualizado_en=now() where id=$1 and exists (select 1 from crm_deal_productos where oportunidad_id=$1)", [oportunidadId]);
    }
    r.get("/oportunidades/:id/productos", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => ({ datos: (await c.query("select id, producto_id, nombre, cantidad, precio::int as precio from crm_deal_productos where oportunidad_id=$1 order by creado_en asc", [id])).rows }));
    });
    r.post("/oportunidades/:id/productos", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id } = req.params as { id: string };
      const b = req.body as { productoId?: string; nombre?: string; cantidad?: number; precio?: number };
      return conCliente(ctx.clienteId, async (c) => {
        let nombre = b.nombre?.trim(), precio = Number(b.precio) || 0;
        if (b.productoId) { const p = (await c.query("select nombre, precio from crm_productos where id=$1", [b.productoId])).rows[0]; if (p) { nombre = nombre || p.nombre; precio = precio || Number(p.precio); } }
        if (!nombre) throw new ErrorApi("VALIDACION", "Falta el producto");
        const li = (await c.query("insert into crm_deal_productos (cliente_id, oportunidad_id, producto_id, nombre, cantidad, precio) values ($1,$2,$3,$4,$5,$6) returning id, producto_id, nombre, cantidad, precio::int as precio",
          [ctx.clienteId, id, b.productoId || null, nombre, Math.max(1, Number(b.cantidad) || 1), precio])).rows[0];
        await recalcularDeal(c, id);
        return li;
      });
    });
    r.delete("/oportunidades/:id/productos/:lid", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id, lid } = req.params as { id: string; lid: string };
      await conCliente(ctx.clienteId, async (c) => { await c.query("delete from crm_deal_productos where id=$1", [lid]); await recalcularDeal(c, id); });
      return { ok: true };
    });

    // LEADS (bandeja de prospectos). Se crean por canal+identidad y se CONVIERTEN a deal.
    r.get("/crm/leads", async (req) => {
      const ctx = await ctxGuard(req, "crm.ver");
      return conCliente(ctx.clienteId, async (c) => ({ datos: (await c.query(
        `select l.id, l.titulo, l.valor::int as valor, l.moneda, l.origen, l.estado, l.creado_en,
                (select identificador from nucleo.identidades i where i.persona_id=l.persona_id and i.canal='email' limit 1) as persona_email
           from crm_leads l where l.estado='activo' order by l.creado_en desc limit 200`)).rows }));
    });
    r.post("/crm/leads", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const b = req.body as { canal?: string; identidad?: string; titulo?: string; valor?: number; moneda?: string; origen?: string };
      if (!b?.canal || !b?.identidad || !b?.titulo?.trim()) throw new ErrorApi("VALIDACION", "Faltan canal, identidad o título");
      return conCliente(ctx.clienteId, async (c) => {
        const persona = await nucleo.asegurarPersona(c, b.canal!, b.identidad!);
        const l = (await c.query("insert into crm_leads (cliente_id, persona_id, titulo, valor, moneda, origen) values ($1,$2,$3,$4,$5,$6) returning id, titulo, valor::int as valor, moneda, origen, estado, creado_en",
          [ctx.clienteId, persona.id, b.titulo!.trim(), Math.max(0, Number(b.valor) || 0), b.moneda || "CLP", b.origen?.trim() || null])).rows[0];
        await nucleo.registrarInteraccion(c, { personaId: persona.id, tipo: "lead.creado", moduloOrigen: "crm", objetoTipo: "lead", objetoId: l.id, resumen: `Lead: ${l.titulo}` });
        return l;
      });
    });
    r.post("/crm/leads/:id/convertir", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id } = req.params as { id: string };
      return conCliente(ctx.clienteId, async (c) => {
        const l = (await c.query("select persona_id, titulo, valor, moneda from crm_leads where id=$1 and estado='activo'", [id])).rows[0];
        if (!l) throw new ErrorApi("NO_ENCONTRADO", "Lead no encontrado o ya convertido");
        const plId = await asegurarPipeline(c, ctx.clienteId);
        const etapaId = (await c.query("select id from crm_etapas where pipeline_id=$1 order by orden asc limit 1", [plId])).rows[0]?.id;
        const o = (await c.query("insert into crm_oportunidades (cliente_id, persona_id, titulo, valor, moneda, pipeline_id, etapa_id) values ($1,$2,$3,$4,$5,$6,$7) returning id, titulo", [ctx.clienteId, l.persona_id, l.titulo, l.valor, l.moneda, plId, etapaId])).rows[0];
        await c.query("update crm_leads set estado='convertido', deal_id=$2 where id=$1", [id, o.id]);
        await nucleo.registrarInteraccion(c, { personaId: l.persona_id, tipo: "lead.convertido", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Lead convertido a deal: ${o.titulo}` });
        return { ok: true, dealId: o.id };
      });
    });
    r.put("/crm/leads/:id/archivar", async (req) => {
      const ctx = await ctxGuard(req, "crm.gestionar");
      const { id } = req.params as { id: string };
      await conCliente(ctx.clienteId, (c) => c.query("update crm_leads set estado='archivado' where id=$1 and estado='activo'", [id]));
      return { ok: true };
    });
  }, { prefix: "/cliente" });
}
