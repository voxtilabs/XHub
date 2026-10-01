-- depende: plataforma
-- xCRM sobre la espina dorsal: la oportunidad cuelga de la MISMA persona del núcleo
-- (no una base de contactos propia). Su historia va a nucleo.interacciones (runtime),
-- así aparece en la ficha 360 y en el contexto del ticket. Owner de esta tabla: crm.
create table if not exists crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  titulo text not null,
  valor bigint not null default 0,
  etapa text not null default 'Prospecto',
  estado text not null default 'abierta' check (estado in ('abierta','ganada','perdida')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrada_en timestamptz
);
alter table crm_oportunidades enable row level security; alter table crm_oportunidades force row level security;
create policy aislar_crm_op on crm_oportunidades using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on crm_oportunidades to xhub_app;
create index if not exists ix_crm_op_persona on crm_oportunidades (cliente_id, persona_id);
