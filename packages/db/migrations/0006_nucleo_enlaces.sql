-- depende: plataforma
-- Enlaces entre objetos de distintos módulos. Así un ticket "queda en el CRM"
-- SIN duplicar dato: cuelga de la misma persona y está enlazado. Soporte de fusión.
create table if not exists nucleo.enlaces (
  seq bigserial primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  origen_tipo text not null,
  origen_id text not null,
  tipo_enlace text not null,
  destino_tipo text not null,
  destino_id text not null,
  creado_en timestamptz not null default now(),
  unique (cliente_id, origen_tipo, origen_id, tipo_enlace, destino_tipo, destino_id)
);
create index if not exists ix_enlaces_origen on nucleo.enlaces (cliente_id, origen_tipo, origen_id);
create index if not exists ix_enlaces_destino on nucleo.enlaces (cliente_id, destino_tipo, destino_id);

alter table nucleo.enlaces enable row level security;
alter table nucleo.enlaces force row level security;
create policy aislar_enlaces on nucleo.enlaces
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.enlaces to xhub_app;
grant usage, select on sequence nucleo.enlaces_seq_seq to xhub_app;

-- Fusión sin bypass de trigger ni privilegios de dueño: el trigger append-only de
-- interacciones permite UPDATE SOLO si cambia únicamente persona_id (repunte de
-- fusión). El contenido de la evidencia sigue siendo inmutable.
create or replace function nucleo.interacciones_solo_append() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La línea de tiempo es append-only: no se puede DELETE';
  end if;
  if (to_jsonb(new) - 'persona_id') is distinct from (to_jsonb(old) - 'persona_id') then
    raise exception 'La línea de tiempo es append-only: solo se permite repuntar persona_id (fusión)';
  end if;
  return new;
end $$ language plpgsql;

-- El rol de app puede repuntar persona_id (la fusión); el trigger acota a solo eso.
grant update (persona_id) on nucleo.interacciones to xhub_app;
