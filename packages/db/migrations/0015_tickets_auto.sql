-- depende: plataforma
-- Auto-asignación round-robin (puntero por equipo) y presencia (colisión de edición).
create table if not exists ticket_rr (
  cliente_id uuid not null,
  equipo_id uuid not null,
  ultimo_idx int not null default -1,
  primary key (cliente_id, equipo_id)
);
alter table ticket_rr enable row level security; alter table ticket_rr force row level security;
create policy aislar_trr on ticket_rr using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update on ticket_rr to xhub_app;

-- Presencia: quién está mirando/editando un ticket (para avisar colisión).
create table if not exists ticket_presencia (
  cliente_id uuid not null,
  ticket_id uuid not null,
  usuario_id uuid not null,
  visto_en timestamptz not null default now(),
  primary key (cliente_id, ticket_id, usuario_id)
);
alter table ticket_presencia enable row level security; alter table ticket_presencia force row level security;
create policy aislar_tpres on ticket_presencia using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on ticket_presencia to xhub_app;
