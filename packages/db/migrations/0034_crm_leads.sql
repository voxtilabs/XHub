-- depende: plataforma
-- Leads (prospectos) al estilo Pipedrive: bandeja aparte del pipeline; se CONVIERTEN a
-- deal. Cuelgan de la misma persona del núcleo.
create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  titulo text not null,
  valor bigint not null default 0,
  moneda text not null default 'CLP',
  origen text,
  estado text not null default 'activo' check (estado in ('activo','convertido','archivado')),
  deal_id uuid references crm_oportunidades(id),
  creado_en timestamptz not null default now()
);
alter table crm_leads enable row level security; alter table crm_leads force row level security;
create policy aislar_crm_lead on crm_leads using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on crm_leads to xhub_app;
create index if not exists ix_crm_lead_estado on crm_leads (cliente_id, estado, creado_en desc);
