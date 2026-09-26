-- depende: plataforma
-- xTickets (tipo Zendesk). SUS objetos; la persona y la historia van al NÚCLEO.
create table if not exists tickets (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  numero bigint not null,                       -- correlativo legible por cliente
  persona_id uuid not null,                     -- persona del núcleo
  asunto text not null,
  estado text not null default 'nuevo'
    check (estado in ('nuevo','abierto','pendiente','resuelto','cerrado')),
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta','urgente')),
  canal_origen text,                            -- whatsapp, email, webchat, llamada
  asignado_a uuid,                              -- usuario/agente del cliente
  resumen text,                                 -- resumen de la conversación
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  unique (cliente_id, numero)
);
create index if not exists ix_tickets_cola on tickets (cliente_id, estado, prioridad, creado_en);
alter table tickets enable row level security;
alter table tickets force row level security;
create policy aislar_tickets on tickets
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update on tickets to xhub_app;

-- Correlativo por cliente
create table if not exists tickets_correlativo (
  cliente_id uuid not null primary key references plataforma.clientes(id),
  proximo bigint not null default 1
);
grant select, insert, update on tickets_correlativo to xhub_app;

-- Mensajes/notas del ticket (la conversación); las notas internas no salen al cliente.
create table if not exists tickets_mensajes (
  seq bigserial primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  ticket_id uuid not null references tickets(id),
  autor_tipo text not null check (autor_tipo in ('persona','agente','sistema')),
  autor_id text,
  cuerpo text not null,
  interno boolean not null default false,       -- nota interna, no visible al cliente
  creado_en timestamptz not null default now()
);
create index if not exists ix_tickets_msg on tickets_mensajes (cliente_id, ticket_id, seq);
alter table tickets_mensajes enable row level security;
alter table tickets_mensajes force row level security;
create policy aislar_tickets_msg on tickets_mensajes
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert on tickets_mensajes to xhub_app;
grant usage, select on sequence tickets_mensajes_seq_seq to xhub_app;
