-- depende: plataforma
-- Productos (catálogo) + line items del deal, al estilo Pipedrive (addDealProduct).
create table if not exists crm_productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text not null,
  codigo text,
  precio bigint not null default 0,
  moneda text not null default 'CLP',
  creado_en timestamptz not null default now()
);
create table if not exists crm_deal_productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  oportunidad_id uuid not null references crm_oportunidades(id) on delete cascade,
  producto_id uuid references crm_productos(id),
  nombre text not null,
  cantidad int not null default 1,
  precio bigint not null default 0,
  creado_en timestamptz not null default now()
);
alter table crm_productos enable row level security; alter table crm_productos force row level security;
create policy aislar_crm_prod on crm_productos using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
alter table crm_deal_productos enable row level security; alter table crm_deal_productos force row level security;
create policy aislar_crm_dprod on crm_deal_productos using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on crm_productos, crm_deal_productos to xhub_app;
create index if not exists ix_crm_dprod_op on crm_deal_productos (cliente_id, oportunidad_id);
