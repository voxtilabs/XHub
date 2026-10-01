-- depende: tickets
-- Asignación de ticket a un USUARIO del panel. tickets.asignado_a es uuid (modelo de
-- agentes antiguo); los usuarios de Better Auth tienen id de TEXTO. Columna aparte.
alter table tickets add column if not exists asignado_usuario text;
create index if not exists ix_tickets_asignado_usuario on tickets (cliente_id, asignado_usuario);
