-- depende: plataforma
-- Actividades de una oportunidad (notas, llamadas, reuniones, tareas). El seguimiento
-- comercial vive junto a la oportunidad; las tareas se marcan hechas.
create table if not exists crm_actividades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  oportunidad_id uuid not null references crm_oportunidades(id) on delete cascade,
  tipo text not null default 'nota' check (tipo in ('nota','llamada','reunion','tarea')),
  cuerpo text not null,
  hecho boolean not null default false,
  autor text,
  creado_en timestamptz not null default now()
);
alter table crm_actividades enable row level security; alter table crm_actividades force row level security;
create policy aislar_crm_act on crm_actividades using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on crm_actividades to xhub_app;
create index if not exists ix_crm_act_op on crm_actividades (cliente_id, oportunidad_id, creado_en desc);
