import type { FastifyInstance } from "fastify";
import { ErrorApi } from "@xhub/core";
import { conPlataforma, conCliente } from "@xhub/db";
import { crearModuloTickets } from "@xhub/modulo-tickets";
import { nucleo } from "../nucleo.js";

/**
 * Correo ENTRANTE (email→ticket) — la otra mitad de "como Zendesk". Un proveedor de
 * correo entrante (Postmark/Mailgun/SES inbound) postea aquí cada email que llega a la
 * casilla de soporte del cliente. Seguridad por SECRETO compartido (XHUB_INBOUND_SECRET,
 * por env). Resuelve el cliente por la dirección "para" (= su correo_soporte de marca);
 * si la persona ya tiene un ticket abierto, AGREGA el mensaje (hilo), si no CREA uno.
 * Todo dentro de conCliente (RLS). Sin HTTP dentro de la transacción (regla nº7).
 */
export function registrarCorreoEntrante(app: FastifyInstance): void {
  const T = crearModuloTickets(nucleo);
  app.post("/api/correo-entrante", async (req, reply) => {
    const secreto = process.env.XHUB_INBOUND_SECRET;
    if (!secreto) { reply.code(503); return { ok: false, motivo: "Entrada de correo no configurada (falta XHUB_INBOUND_SECRET)" }; }
    if (req.headers["x-webhook-secreto"] !== secreto) { reply.code(401); return { ok: false, motivo: "Secreto inválido" }; }
    const b = req.body as { para?: string; de?: string; asunto?: string; texto?: string };
    if (!b?.para || !b?.de) throw new ErrorApi("VALIDACION", "Faltan 'para' y 'de'");
    const clienteId = await conPlataforma(async (c) =>
      (await c.query("select cliente_id from plataforma.clientes_marca where lower(correo_soporte)=lower($1)", [b.para])).rows[0]?.cliente_id as string | undefined);
    if (!clienteId) { reply.code(404); return { ok: false, motivo: `Ningún cliente usa ${b.para} como correo de soporte` }; }
    const asunto = (b.asunto || "(sin asunto)").slice(0, 200);
    const texto = b.texto || "";
    return conCliente(clienteId, async (c) => {
      const persona = await nucleo.asegurarPersona(c, "email", b.de!);
      const abierto = await c.query("select id, numero::text as numero from tickets where persona_id=$1 and estado not in ('resuelto','cerrado') order by numero desc limit 1", [persona.id]);
      if (abierto.rowCount) {
        const t = abierto.rows[0];
        await T.agregarMensaje(c, t.id, { autorTipo: "persona", cuerpo: texto });
        await c.query("update tickets set estado=case when estado='pendiente' then 'abierto' else estado end, actualizado_en=now() where id=$1", [t.id]);
        return { ok: true, modo: "agregado", ticketId: t.id, numero: t.numero };
      }
      const t = await T.crearTicket(c, { canal: "email", identidad: b.de!, asunto, cuerpo: texto });
      return { ok: true, modo: "creado", ticketId: t.id, numero: t.numero };
    });
  });
}
