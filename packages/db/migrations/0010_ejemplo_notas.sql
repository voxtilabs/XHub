-- depende: plataforma
-- Módulo de referencia: SUS objetos propios (una "nota"). NO guarda personas.
create table if not exists ejemplo_notas (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,     -- referencia a la persona del NÚCLEO
  texto text not null,
  creado_en timestamptz not null default now()
);
alter table ejemplo_notas enable row level security;
alter table ejemplo_notas force row level security;
create policy aislar_ejemplo_notas on ejemplo_notas
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on ejemplo_notas to xhub_app;
