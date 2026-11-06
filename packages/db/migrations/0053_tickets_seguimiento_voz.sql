-- depende: plataforma,nucleo
-- Seguimiento por voz opcional y retrocompatible: sin consentimiento no hay avisos.
alter table tickets add column if not exists telefono_voz text;
alter table tickets add column if not exists autoriza_aviso_voz boolean not null default false;
alter table tickets add column if not exists sla_modo text not null default 'habil'
  check (sla_modo in ('habil','corrido'));

create table if not exists ticket_avisos_voz (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  ticket_id uuid not null references tickets(id),
  mensaje_seq bigint not null references tickets_mensajes(seq),
  estado text not null default 'cola' check (estado in ('cola','reservado','entregado','fallido','incierto')),
  reserva uuid,
  reservado_en timestamptz,
  terminado_en timestamptz,
  unique (cliente_id,mensaje_seq)
);
alter table ticket_avisos_voz enable row level security;
alter table ticket_avisos_voz force row level security;
create policy aislar_tav on ticket_avisos_voz
  using (cliente_id=nullif(current_setting('app.cliente_id',true),'')::uuid)
  with check (cliente_id=nullif(current_setting('app.cliente_id',true),'')::uuid);
grant select,insert,update on ticket_avisos_voz to xhub_app;

create table if not exists ticket_alertas_sla (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  ticket_id uuid not null references tickets(id),
  tipo text not null default 'primera_respuesta',
  vence_en timestamptz not null,
  detectada_en timestamptz not null default now(),
  unique (cliente_id,ticket_id,tipo)
);
alter table ticket_alertas_sla enable row level security;
alter table ticket_alertas_sla force row level security;
create policy aislar_tas on ticket_alertas_sla
  using (cliente_id=nullif(current_setting('app.cliente_id',true),'')::uuid)
  with check (cliente_id=nullif(current_setting('app.cliente_id',true),'')::uuid);
grant select,insert on ticket_alertas_sla to xhub_app;
create index if not exists ix_ticket_voz_contacto on tickets(cliente_id,telefono_voz)
  where telefono_voz is not null;
