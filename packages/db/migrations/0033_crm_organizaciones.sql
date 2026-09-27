-- depende: plataforma
-- Organizaciones (empresas) al estilo Pipedrive. El deal puede colgar de una empresa.
create table if not exists crm_organizaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text not null,
  sitio_web text,
  rubro text,
  telefono text,
  direccion text,
  creado_en timestamptz not null default now()
);
alter table crm_organizaciones enable row level security; alter table crm_organizaciones force row level security;
create policy aislar_crm_org on crm_organizaciones using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on crm_organizaciones to xhub_app;
alter table crm_oportunidades add column if not exists org_id uuid references crm_organizaciones(id);
create index if not exists ix_crm_op_org on crm_oportunidades (cliente_id, org_id);
