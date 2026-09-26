-- depende: plataforma
-- Outbox transaccional: el evento se escribe en la MISMA transacción que el
-- cambio de negocio. Si la transacción se revierte, el evento no existe.
-- Leyes de la casa 6 y 7: idempotencia, y nunca HTTP dentro de la transacción.
create table if not exists nucleo.outbox (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid,
  modulo text not null,               -- módulo que emite (para saltar los apagados)
  tipo text not null,                 -- 'ticket.creado', etc.
  payload jsonb not null default '{}',
  creado_en timestamptz not null default now(),
  procesado_en timestamptz,
  intentos int not null default 0,
  ultimo_error text
);
grant select, insert, update on nucleo.outbox to xhub_app;
create index if not exists ix_outbox_pendiente on nucleo.outbox (creado_en)
  where procesado_en is null;

-- Entrega ÚNICA: registro de eventos ya procesados por consumidor.
create table if not exists nucleo.eventos_procesados (
  evento_id uuid not null,
  consumidor text not null,
  procesado_en timestamptz not null default now(),
  primary key (evento_id, consumidor)
);
grant select, insert on nucleo.eventos_procesados to xhub_app;
