-- Cola de muertos del conector (#56): cuando una operación falla definitivamente,
-- queda aquí con su causa LEGIBLE (en español), la carga original para reintentar
-- (sin secretos) y el contador de intentos. El panel la muestra y permite reintentar.
create table if not exists plataforma.conector_muertos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid references plataforma.clientes(id) on delete cascade,
  instancia_id  uuid,
  tipo          text not null,                 -- p.ej. 'sync.contactos'
  carga         jsonb not null,                -- payload para reintentar (jamás el secreto)
  causa         text not null,                 -- legible, en español
  intentos      int  not null default 1,
  creado_en     timestamptz not null default now(),
  ultimo_intento timestamptz not null default now(),
  resuelto_en   timestamptz
);
-- Un solo muerto vivo por (instancia, tipo): los reintentos incrementan, no acumulan.
create unique index if not exists ux_muertos_vivo on plataforma.conector_muertos (instancia_id, tipo) where resuelto_en is null;
create index if not exists ix_muertos_cliente on plataforma.conector_muertos (cliente_id) where resuelto_en is null;
grant select, insert, update, delete on plataforma.conector_muertos to xhub_app;
