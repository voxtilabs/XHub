-- depende: plataforma
-- Línea de tiempo: append-only, orden por seq (NUNCA created_at: now() es fijo por
-- transacción en pg). Depende de nucleo.personas(cliente_id,id) de 0004.
-- Idempotente por dedupe_id (id determinista del outbox): un reintento de BullMQ
-- no duplica evidencia inmutable (ley 6).
create table if not exists nucleo.interacciones (
  seq bigserial primary key,
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  tipo text not null,
  ocurrio_en timestamptz not null default now(),
  modulo_origen text not null,
  objeto_tipo text,
  objeto_id text,
  resumen text,
  meta jsonb not null default '{}',
  dedupe_id text,
  unique (cliente_id, dedupe_id),
  foreign key (cliente_id, persona_id)
    references nucleo.personas(cliente_id, id) on delete restrict
);
create index if not exists ix_interacciones_persona
  on nucleo.interacciones (cliente_id, persona_id, seq desc);

alter table nucleo.interacciones enable row level security;
alter table nucleo.interacciones force row level security;
create policy aislar_interacciones on nucleo.interacciones
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);

-- Append-only: solo select/insert. Ni update ni delete para el rol de app.
grant select, insert on nucleo.interacciones to xhub_app;
grant usage, select on sequence nucleo.interacciones_seq_seq to xhub_app;

-- Trigger anti update/delete (defensa en profundidad, la evidencia no se toca).
create or replace function nucleo.interacciones_solo_append() returns trigger as $$
begin raise exception 'La línea de tiempo es append-only: no se puede %', tg_op; end $$ language plpgsql;
drop trigger if exists t_interacciones_append on nucleo.interacciones;
create trigger t_interacciones_append before update or delete on nucleo.interacciones
  for each row execute function nucleo.interacciones_solo_append();
