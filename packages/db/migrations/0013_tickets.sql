-- depende: plataforma
-- Migración de xTickets. Corre en la base compartida de xHub. Owner de estas tablas.
create table if not exists tickets (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  numero bigint not null, persona_id uuid not null, asunto text not null,
  estado text not null default 'nuevo' check (estado in ('nuevo','abierto','pendiente','resuelto','cerrado')),
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta','urgente')),
  canal_origen text, asignado_a uuid, resumen text,
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(), resuelto_en timestamptz,
  unique (cliente_id, numero)
);
create table if not exists tickets_correlativo (cliente_id uuid not null primary key, proximo bigint not null default 1);
create table if not exists tickets_mensajes (
  seq bigserial primary key, cliente_id uuid not null, ticket_id uuid not null references tickets(id),
  autor_tipo text not null check (autor_tipo in ('persona','agente','sistema')), autor_id text,
  cuerpo text not null, interno boolean not null default false, creado_en timestamptz not null default now()
);

-- RLS del monorepo
alter table tickets enable row level security; alter table tickets force row level security;
create policy aislar_tickets on tickets using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update on tickets to xhub_app;
grant select, insert, update on tickets_correlativo to xhub_app;
alter table tickets_mensajes enable row level security; alter table tickets_mensajes force row level security;
create policy aislar_tickets_msg on tickets_mensajes using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert on tickets_mensajes to xhub_app;
grant usage, select on sequence tickets_mensajes_seq_seq to xhub_app;
