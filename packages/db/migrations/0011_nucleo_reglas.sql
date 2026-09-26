-- depende: plataforma
-- Motor de reglas entre módulos. "Cuando llega un ticket, que se registre en el CRM."
-- Declarativo, por cliente, y APAGADO al nacer.
create table if not exists nucleo.reglas (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text not null,
  evento text not null,               -- 'ticket.creado', etc.
  condicion jsonb not null default '{}',
  accion jsonb not null,              -- {tipo:'crear_oportunidad', ...}
  modulo_destino text,                -- si está apagado, la regla se PAUSA con aviso
  activa boolean not null default false,   -- nace apagada
  creada_en timestamptz not null default now()
);
alter table nucleo.reglas enable row level security;
alter table nucleo.reglas force row level security;
create policy aislar_reglas on nucleo.reglas
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.reglas to xhub_app;

-- Ejecuciones: idempotencia por (regla, objeto disparador). 3 fallos → detiene ese objeto.
create table if not exists nucleo.regla_ejecuciones (
  regla_id uuid not null,
  objeto_id text not null,
  resultado text not null,            -- 'ok' | 'skip' | 'error'
  intentos int not null default 1,
  ejecutada_en timestamptz not null default now(),
  primary key (regla_id, objeto_id)
);
grant select, insert, update on nucleo.regla_ejecuciones to xhub_app;
