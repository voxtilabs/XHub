import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ErrorApi } from "@xhub/core";
import { exigirScope } from "@xhub/modulo-nucleo";
import { nucleo } from "../nucleo.js";
import { conContexto } from "../app.js";
import { validar, canalEnum } from "../esquemas.js";
import { asegurarPipeline } from "./crm.js";

/**
 * API PÚBLICA de xCRM (`/v1/crm/*`). Misma espina dorsal que la consola: la
 * oportunidad y el prospecto cuelgan de la MISMA persona del núcleo y quedan en su
 * línea de tiempo. Autenticada por llave (bearer), acotada por los scopes
 * `crm.leer` / `crm.escribir`, y por RLS al cliente de la llave.
 *
 * Convenciones exquisitas y uniformes en toda la superficie:
 *  - Listas: sobre `{ datos: [...], siguiente: <cursor>|null }`, paginación keyset
 *    estable por `(creado_en, id)` — nunca OFFSET, que se corre al insertarse filas.
 *  - Escrituras: crean la persona si no existe (canal + identidad), como los tickets.
 *  - Montos en enteros de la moneda menor (sin decimales), moneda ISO aparte.
 */

// ── Cursor keyset: base64url de "creado_en|id". Opaco para el cliente. ──────────
const codificarCursor = (creadoEn: string, id: string) => Buffer.from(`${creadoEn}|${id}`).toString("base64url");
function decodificarCursor(cur?: string): { creadoEn: string; id: string } | null {
  if (!cur) return null;
  try {
    const [creadoEn, id] = Buffer.from(cur, "base64url").toString("utf8").split("|");
    return creadoEn && id ? { creadoEn, id } : null;
  } catch { return null; }
}
const limiteDe = (q: { limite?: string }) => Math.min(100, Math.max(1, Number(q.limite) || 50));

// ── Esquemas de entrada ─────────────────────────────────────────────────────────
const crearOportunidad = z.object({
  canal: canalEnum,
  identidad: z.string().min(1).max(200),
  titulo: z.string().min(1).max(300),
  valor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  moneda: z.string().length(3).optional(),
  embudoId: z.string().uuid().optional(),
  etapaId: z.string().uuid().optional(),
  cierreEsperado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  probabilidad: z.number().int().min(0).max(100).optional(),
  orgId: z.string().uuid().optional(),
}).strict();

const actualizarOportunidad = z.object({
  titulo: z.string().min(1).max(300).optional(),
  valor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  moneda: z.string().length(3).optional(),
  etapaId: z.string().uuid().optional(),
  cierreEsperado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  probabilidad: z.number().int().min(0).max(100).nullable().optional(),
  orgId: z.string().uuid().nullable().optional(),
}).strict().refine((o) => Object.keys(o).length > 0, "Nada que actualizar");

const cerrarOportunidad = z.object({
  resultado: z.enum(["ganada", "perdida"]),
  motivo: z.string().max(500).optional(),
}).strict();

const crearActividad = z.object({
  tipo: z.enum(["nota", "llamada", "reunion", "tarea"]).optional(),
  cuerpo: z.string().min(1).max(4000),
}).strict();

const crearOrganizacion = z.object({
  nombre: z.string().min(1).max(200),
  sitioWeb: z.string().max(300).optional(),
  rubro: z.string().max(120).optional(),
  telefono: z.string().max(60).optional(),
  direccion: z.string().max(300).optional(),
}).strict();

const crearProspecto = z.object({
  canal: canalEnum,
  identidad: z.string().min(1).max(200),
  titulo: z.string().min(1).max(300),
  valor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  moneda: z.string().length(3).optional(),
  origen: z.string().max(120).optional(),
}).strict();

// Proyección estable de una oportunidad hacia afuera.
const SEL_OPORTUNIDAD = `o.id, o.titulo, o.valor::int as valor, o.moneda, o.estado, o.persona_id,
  o.etapa_id, o.pipeline_id as embudo_id, o.probabilidad, o.cierre_esperado::text as cierre_esperado,
  o.org_id, o.motivo_perdida, o.creado_en::text as creado_en,
  (select nombre from crm_etapas e where e.id=o.etapa_id) as etapa,
  (select nombre from crm_organizaciones og where og.id=o.org_id) as organizacion`;

export function registrarRutasCrm(app: FastifyInstance): void {
  // ── Embudos (pipelines + etapas) ──────────────────────────────────────────────
  app.get("/crm/embudos", async (req) => {
    exigirScope(req.ctx!, "crm.leer");
    return conContexto(req, async (c) => {
      const embudos = (await c.query("select id, nombre, orden from crm_pipelines order by orden asc")).rows;
      for (const e of embudos)
        e.etapas = (await c.query("select id, nombre, orden, probabilidad from crm_etapas where pipeline_id=$1 order by orden asc", [e.id])).rows;
      return { datos: embudos };
    });
  });

  // ── Oportunidades ─────────────────────────────────────────────────────────────
  app.get("/crm/oportunidades", async (req) => {
    exigirScope(req.ctx!, "crm.leer");
    const q = req.query as { embudo?: string; etapa?: string; estado?: string; cursor?: string; limite?: string };
    const lim = limiteDe(q);
    const cur = decodificarCursor(q.cursor);
    return conContexto(req, async (c) => {
      const cond: string[] = []; const args: unknown[] = [];
      if (q.embudo) { args.push(q.embudo); cond.push(`o.pipeline_id=$${args.length}`); }
      if (q.etapa) { args.push(q.etapa); cond.push(`o.etapa_id=$${args.length}`); }
      if (q.estado) {
        if (!["abierta", "ganada", "perdida"].includes(q.estado)) throw new ErrorApi("VALIDACION", "estado inválido");
        args.push(q.estado); cond.push(`o.estado=$${args.length}`);
      }
      if (cur) { args.push(cur.creadoEn, cur.id); cond.push(`(o.creado_en, o.id) < ($${args.length - 1}, $${args.length})`); }
      const where = cond.length ? `where ${cond.join(" and ")}` : "";
      args.push(lim + 1);
      const filas = (await c.query(`select ${SEL_OPORTUNIDAD} from crm_oportunidades o ${where} order by o.creado_en desc, o.id desc limit $${args.length}`, args)).rows;
      const hay = filas.length > lim; const datos = filas.slice(0, lim); const ult = datos[datos.length - 1];
      return { datos, siguiente: hay && ult ? codificarCursor(ult.creado_en, ult.id) : null };
    });
  });

  app.post("/crm/oportunidades", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const b = validar(crearOportunidad, req.body);
    return conContexto(req, async (c) => {
      const plId = b.embudoId || await asegurarPipeline(c, req.ctx!.clienteId);
      const etapaId = b.etapaId || (await c.query("select id from crm_etapas where pipeline_id=$1 order by orden asc limit 1", [plId])).rows[0]?.id;
      const persona = await nucleo.asegurarPersona(c, b.canal, b.identidad);
      const o = (await c.query(
        `insert into crm_oportunidades (cliente_id, persona_id, titulo, valor, moneda, pipeline_id, etapa_id, cierre_esperado, probabilidad, org_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [req.ctx!.clienteId, persona.id, b.titulo.trim(), b.valor ?? 0, b.moneda ?? "CLP", plId, etapaId, b.cierreEsperado ?? null, b.probabilidad ?? null, b.orgId ?? null])).rows[0];
      await nucleo.registrarInteraccion(c, { personaId: persona.id, tipo: "oportunidad.creada", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Oportunidad: ${b.titulo.trim()}` });
      return (await c.query(`select ${SEL_OPORTUNIDAD} from crm_oportunidades o where o.id=$1`, [o.id])).rows[0];
    });
  });

  app.get("/crm/oportunidades/:id", async (req) => {
    exigirScope(req.ctx!, "crm.leer");
    const { id } = req.params as { id: string };
    return conContexto(req, async (c) => {
      const o = (await c.query(`select ${SEL_OPORTUNIDAD} from crm_oportunidades o where o.id=$1`, [id])).rows[0];
      if (!o) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada");
      o.actividades = (await c.query("select id, tipo, cuerpo, hecho, autor, creado_en::text as creado_en from crm_actividades where oportunidad_id=$1 order by creado_en desc", [id])).rows;
      return o;
    });
  });

  app.patch("/crm/oportunidades/:id", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const { id } = req.params as { id: string };
    const b = validar(actualizarOportunidad, req.body);
    const col: Record<string, string> = { titulo: "titulo", valor: "valor", moneda: "moneda", etapaId: "etapa_id", cierreEsperado: "cierre_esperado", probabilidad: "probabilidad", orgId: "org_id" };
    return conContexto(req, async (c) => {
      const sets: string[] = []; const args: unknown[] = [id];
      for (const [k, v] of Object.entries(b)) { args.push(v); sets.push(`${col[k]}=$${args.length}`); }
      sets.push("actualizado_en=now()");
      const o = (await c.query(`update crm_oportunidades set ${sets.join(", ")} where id=$1 returning id`, args)).rows[0];
      if (!o) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada");
      return (await c.query(`select ${SEL_OPORTUNIDAD} from crm_oportunidades o where o.id=$1`, [id])).rows[0];
    });
  });

  app.post("/crm/oportunidades/:id/cerrar", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const { id } = req.params as { id: string };
    const b = validar(cerrarOportunidad, req.body);
    return conContexto(req, async (c) => {
      const o = (await c.query(
        "update crm_oportunidades set estado=$2, motivo_perdida=$3, cerrada_en=now(), actualizado_en=now() where id=$1 and estado='abierta' returning id, persona_id, titulo",
        [id, b.resultado, b.resultado === "perdida" ? (b.motivo ?? null) : null])).rows[0];
      if (!o) throw new ErrorApi("CONFLICTO", "La oportunidad no existe o ya está cerrada");
      await nucleo.registrarInteraccion(c, { personaId: o.persona_id, tipo: `oportunidad.${b.resultado}`, moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: id, resumen: `Oportunidad ${b.resultado}: ${o.titulo}` });
      return (await c.query(`select ${SEL_OPORTUNIDAD} from crm_oportunidades o where o.id=$1`, [id])).rows[0];
    });
  });

  app.post("/crm/oportunidades/:id/actividades", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const { id } = req.params as { id: string };
    const b = validar(crearActividad, req.body);
    return conContexto(req, async (c) => {
      const dueno = (await c.query("select persona_id from crm_oportunidades where id=$1", [id])).rows[0];
      if (!dueno) throw new ErrorApi("NO_ENCONTRADO", "Oportunidad no encontrada");
      const a = (await c.query(
        "insert into crm_actividades (cliente_id, oportunidad_id, tipo, cuerpo, autor) values ($1,$2,$3,$4,$5) returning id, tipo, cuerpo, hecho, autor, creado_en::text as creado_en",
        [req.ctx!.clienteId, id, b.tipo ?? "nota", b.cuerpo, "api"])).rows[0];
      await nucleo.registrarInteraccion(c, { personaId: dueno.persona_id, tipo: `crm.${a.tipo}`, moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: id, resumen: b.cuerpo.slice(0, 140) });
      return a;
    });
  });

  // ── Organizaciones ────────────────────────────────────────────────────────────
  app.get("/crm/organizaciones", async (req) => {
    exigirScope(req.ctx!, "crm.leer");
    const q = req.query as { cursor?: string; limite?: string }; const lim = limiteDe(q); const cur = decodificarCursor(q.cursor);
    return conContexto(req, async (c) => {
      const args: unknown[] = []; let where = "";
      if (cur) { args.push(cur.creadoEn, cur.id); where = `where (creado_en, id) < ($1, $2)`; }
      args.push(lim + 1);
      const filas = (await c.query(`select id, nombre, sitio_web, rubro, telefono, direccion, creado_en::text as creado_en from crm_organizaciones ${where} order by creado_en desc, id desc limit $${args.length}`, args)).rows;
      const hay = filas.length > lim; const datos = filas.slice(0, lim); const ult = datos[datos.length - 1];
      return { datos, siguiente: hay && ult ? codificarCursor(ult.creado_en, ult.id) : null };
    });
  });

  app.post("/crm/organizaciones", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const b = validar(crearOrganizacion, req.body);
    return conContexto(req, async (c) => (await c.query(
      "insert into crm_organizaciones (cliente_id, nombre, sitio_web, rubro, telefono, direccion) values ($1,$2,$3,$4,$5,$6) returning id, nombre, sitio_web, rubro, telefono, direccion, creado_en::text as creado_en",
      [req.ctx!.clienteId, b.nombre, b.sitioWeb ?? null, b.rubro ?? null, b.telefono ?? null, b.direccion ?? null])).rows[0]);
  });

  // ── Prospectos (leads) ────────────────────────────────────────────────────────
  app.get("/crm/prospectos", async (req) => {
    exigirScope(req.ctx!, "crm.leer");
    const q = req.query as { estado?: string; cursor?: string; limite?: string }; const lim = limiteDe(q); const cur = decodificarCursor(q.cursor);
    return conContexto(req, async (c) => {
      const cond: string[] = []; const args: unknown[] = [];
      if (q.estado) {
        if (!["activo", "convertido", "archivado"].includes(q.estado)) throw new ErrorApi("VALIDACION", "estado inválido");
        args.push(q.estado); cond.push(`estado=$${args.length}`);
      }
      if (cur) { args.push(cur.creadoEn, cur.id); cond.push(`(creado_en, id) < ($${args.length - 1}, $${args.length})`); }
      const where = cond.length ? `where ${cond.join(" and ")}` : "";
      args.push(lim + 1);
      const filas = (await c.query(`select id, persona_id, titulo, valor::int as valor, moneda, origen, estado, deal_id, creado_en::text as creado_en from crm_leads ${where} order by creado_en desc, id desc limit $${args.length}`, args)).rows;
      const hay = filas.length > lim; const datos = filas.slice(0, lim); const ult = datos[datos.length - 1];
      return { datos, siguiente: hay && ult ? codificarCursor(ult.creado_en, ult.id) : null };
    });
  });

  app.post("/crm/prospectos", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const b = validar(crearProspecto, req.body);
    return conContexto(req, async (c) => {
      const persona = await nucleo.asegurarPersona(c, b.canal, b.identidad);
      const l = (await c.query(
        "insert into crm_leads (cliente_id, persona_id, titulo, valor, moneda, origen) values ($1,$2,$3,$4,$5,$6) returning id, persona_id, titulo, valor::int as valor, moneda, origen, estado, deal_id, creado_en::text as creado_en",
        [req.ctx!.clienteId, persona.id, b.titulo.trim(), b.valor ?? 0, b.moneda ?? "CLP", b.origen ?? null])).rows[0];
      await nucleo.registrarInteraccion(c, { personaId: persona.id, tipo: "prospecto.creado", moduloOrigen: "crm", objetoTipo: "prospecto", objetoId: l.id, resumen: `Prospecto: ${b.titulo.trim()}` });
      return l;
    });
  });

  // Convertir prospecto → oportunidad (Pipedrive: lead → deal), enlazado a la misma persona.
  app.post("/crm/prospectos/:id/convertir", async (req) => {
    exigirScope(req.ctx!, "crm.escribir");
    const { id } = req.params as { id: string };
    return conContexto(req, async (c) => {
      const l = (await c.query("select id, persona_id, titulo, valor::int as valor, moneda from crm_leads where id=$1 and estado='activo'", [id])).rows[0];
      if (!l) throw new ErrorApi("CONFLICTO", "El prospecto no existe o ya fue convertido/archivado");
      const plId = await asegurarPipeline(c, req.ctx!.clienteId);
      const etapaId = (await c.query("select id from crm_etapas where pipeline_id=$1 order by orden asc limit 1", [plId])).rows[0]?.id;
      const o = (await c.query(
        "insert into crm_oportunidades (cliente_id, persona_id, titulo, valor, moneda, pipeline_id, etapa_id) values ($1,$2,$3,$4,$5,$6,$7) returning id",
        [req.ctx!.clienteId, l.persona_id, l.titulo, l.valor, l.moneda, plId, etapaId])).rows[0];
      await c.query("update crm_leads set estado='convertido', deal_id=$2 where id=$1", [id, o.id]);
      await nucleo.registrarInteraccion(c, { personaId: l.persona_id, tipo: "prospecto.convertido", moduloOrigen: "crm", objetoTipo: "oportunidad", objetoId: o.id, resumen: `Prospecto convertido: ${l.titulo}` });
      return (await c.query(`select ${SEL_OPORTUNIDAD} from crm_oportunidades o where o.id=$1`, [o.id])).rows[0];
    });
  });

  // ── Insights: forecast ponderado + estado del embudo ──────────────────────────
  app.get("/crm/insights", async (req) => {
    exigirScope(req.ctx!, "crm.leer");
    const q = req.query as { embudo?: string };
    return conContexto(req, async (c) => {
      const plId = q.embudo || await asegurarPipeline(c, req.ctx!.clienteId);
      const porEtapa = (await c.query(
        `select e.nombre, e.orden, e.probabilidad, count(o.id)::int n, coalesce(sum(o.valor),0)::int valor
           from crm_etapas e left join crm_oportunidades o on o.etapa_id=e.id and o.estado='abierta'
          where e.pipeline_id=$1 group by e.id, e.nombre, e.orden, e.probabilidad order by e.orden asc`, [plId])).rows;
      const fc = (await c.query("select coalesce(sum(valor * coalesce(probabilidad, (select probabilidad from crm_etapas e where e.id=o.etapa_id), 0) / 100.0),0)::int forecast from crm_oportunidades o where estado='abierta' and pipeline_id=$1", [plId])).rows[0];
      const g = (await c.query("select count(*)::int n, coalesce(sum(valor),0)::int v from crm_oportunidades where estado='ganada' and pipeline_id=$1", [plId])).rows[0];
      const p = (await c.query("select count(*)::int n from crm_oportunidades where estado='perdida' and pipeline_id=$1", [plId])).rows[0];
      const cerradas = g.n + p.n;
      return { embudoId: plId, forecast: fc.forecast, porEtapa, ganadas: { n: g.n, valor: g.v }, perdidas: { n: p.n }, tasaConversion: cerradas > 0 ? Math.round((g.n / cerradas) * 100) : 0 };
    });
  });
}
