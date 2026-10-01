-- depende: plataforma
-- Regla de negocio CORREGIDA (voxia): la conversación ABANDONADA crea ticket + ficha360;
-- la ATENDIDA se registra SOLO en la ficha360 (sin ticket). Default false = triage normal;
-- el cliente la enciende (p.ej. Municipalidad de Temuco). La columna vieja
-- ficha_en_abandonadas queda en desuso (migraciones aditivas, no se borra).
alter table ticket_triage_config
  add column if not exists ticket_solo_si_abandonada boolean not null default false;

-- Catálogo de automatizaciones por cliente: toggles de reglas de negocio. GENÉRICO —
-- sumar una automatización nueva NO requiere migración (una fila por cliente+clave).
-- El catálogo de claves disponibles vive en código (CATALOGO_AUTOMATIZACIONES).
create table if not exists plataforma.cliente_automatizaciones (
  cliente_id uuid not null references plataforma.clientes(id),
  clave text not null,
  activa boolean not null default false,
  params jsonb not null default '{}',
  actualizado_en timestamptz not null default now(),
  primary key (cliente_id, clave)
);
alter table plataforma.cliente_automatizaciones enable row level security;
alter table plataforma.cliente_automatizaciones force row level security;
drop policy if exists aislar_automatizaciones on plataforma.cliente_automatizaciones;  -- idempotente
create policy aislar_automatizaciones on plataforma.cliente_automatizaciones
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on plataforma.cliente_automatizaciones to xhub_app;
