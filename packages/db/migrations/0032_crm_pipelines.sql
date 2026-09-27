-- depende: plataforma
-- xCRM al estilo Pipedrive: pipelines con etapas CONFIGURABLES (probabilidad + pudrición),
-- y campos ricos del deal (moneda, cierre esperado, probabilidad, motivo de pérdida).
create table if not exists crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create table if not exists crm_etapas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  pipeline_id uuid not null references crm_pipelines(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  probabilidad int not null default 100,
  dias_pudre int,
  creado_en timestamptz not null default now()
);
alter table crm_pipelines enable row level security; alter table crm_pipelines force row level security;
create policy aislar_crm_pl on crm_pipelines using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
alter table crm_etapas enable row level security; alter table crm_etapas force row level security;
create policy aislar_crm_et on crm_etapas using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on crm_pipelines, crm_etapas to xhub_app;

-- Campos ricos del deal (Pipedrive)
alter table crm_oportunidades add column if not exists pipeline_id uuid references crm_pipelines(id);
alter table crm_oportunidades add column if not exists etapa_id uuid references crm_etapas(id);
alter table crm_oportunidades add column if not exists moneda text not null default 'CLP';
alter table crm_oportunidades add column if not exists cierre_esperado date;
alter table crm_oportunidades add column if not exists probabilidad int;
alter table crm_oportunidades add column if not exists motivo_perdida text;
create index if not exists ix_crm_op_etapa on crm_oportunidades (cliente_id, etapa_id);
