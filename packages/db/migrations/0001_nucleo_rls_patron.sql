-- depende: plataforma
create schema if not exists nucleo;
grant usage on schema nucleo to xhub_app;

-- Tabla de negocio de ejemplo/patrón: toda tabla de negocio lleva cliente_id,
-- RLS FORZADA, y política que compara contra app.cliente_id de la sesión.
create table if not exists nucleo.notas_demo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  texto text not null,
  creado_en timestamptz not null default now()
);

alter table nucleo.notas_demo enable row level security;
alter table nucleo.notas_demo force row level security;  -- aplica también al dueño

-- Aísla por el cliente fijado en la sesión (conCliente). NULLIF evita que una
-- sesión sin cliente vea todo por coincidencia de NULL.
create policy aislar_por_cliente on nucleo.notas_demo
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);

grant select, insert, update, delete on nucleo.notas_demo to xhub_app;
