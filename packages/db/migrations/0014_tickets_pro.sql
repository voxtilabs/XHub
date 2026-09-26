-- depende: plataforma
-- xTickets profesional: jerarquía de usuarios, equipos, SLA, categorías, macros, CSAT.

-- Equipos (grupos de agentes con enrutamiento propio).
create table if not exists ticket_equipos (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null,
  nombre text not null,
  creado_en timestamptz not null default now(),
  unique (cliente_id, nombre)
);

-- Jerarquía de agentes: rol + equipo. Un usuario del cliente puede ser agente en
-- varios equipos con distinto rol.
create table if not exists ticket_agentes (
  cliente_id uuid not null,
  usuario_id uuid not null,
  equipo_id uuid,
  rol text not null check (rol in ('agente','supervisor','admin')),
  activo boolean not null default true
);
-- Único por (cliente, usuario, equipo) tratando NULL como un valor concreto.
create unique index if not exists ux_ticket_agentes
  on ticket_agentes (cliente_id, usuario_id, coalesce(equipo_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Políticas de SLA por prioridad: minutos hábiles a primera respuesta y a resolución.
create table if not exists ticket_sla (
  cliente_id uuid not null,
  prioridad text not null check (prioridad in ('baja','media','alta','urgente')),
  primera_respuesta_min int not null,
  resolucion_min int not null,
  primary key (cliente_id, prioridad)
);

-- Macros / respuestas rápidas por equipo o globales.
create table if not exists ticket_macros (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null,
  equipo_id uuid,
  titulo text not null,
  cuerpo text not null,
  acciones jsonb not null default '{}'
);

-- Categorías configurables.
create table if not exists ticket_categorias (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null,
  nombre text not null,
  equipo_id uuid,
  unique (cliente_id, nombre)
);

-- Ampliar tickets con equipo, categoría, etiquetas, SLA y satisfacción.
alter table tickets add column if not exists equipo_id uuid;
alter table tickets add column if not exists categoria text;
alter table tickets add column if not exists etiquetas text[] not null default '{}';
alter table tickets add column if not exists sla_primera_resp_vence timestamptz;
alter table tickets add column if not exists sla_resolucion_vence timestamptz;
alter table tickets add column if not exists primera_respuesta_en timestamptz;
alter table tickets add column if not exists satisfaccion int;   -- 1..5, CSAT
alter table tickets add column if not exists sla_incumplido boolean not null default false;

alter table ticket_equipos enable row level security; alter table ticket_equipos force row level security;
create policy aislar_teq on ticket_equipos using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
alter table ticket_agentes enable row level security; alter table ticket_agentes force row level security;
create policy aislar_tag on ticket_agentes using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
alter table ticket_sla enable row level security; alter table ticket_sla force row level security;
create policy aislar_tsla on ticket_sla using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
alter table ticket_macros enable row level security; alter table ticket_macros force row level security;
create policy aislar_tmac on ticket_macros using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
alter table ticket_categorias enable row level security; alter table ticket_categorias force row level security;
create policy aislar_tcat on ticket_categorias using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on ticket_equipos, ticket_agentes, ticket_sla, ticket_macros, ticket_categorias to xhub_app;
