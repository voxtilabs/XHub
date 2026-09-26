-- Roles de xHub sobre el usuario de Better Auth. Dos poblaciones (ADR 0006/§5):
--   rol = 'plataforma'  → superadmin X5/VoxTi (cruza clientes)
--   rol = 'admin_cliente' → admin de UN cliente (clienteId), gestiona lo suyo
--   rol = 'agente' → usa xTickets, no configura
-- Columnas en "user" (Better Auth las lee vía additionalFields).
alter table "user" add column if not exists "rol" text not null default 'plataforma';
alter table "user" add column if not exists "clienteId" text;
create index if not exists ix_user_cliente on "user" ("clienteId");
