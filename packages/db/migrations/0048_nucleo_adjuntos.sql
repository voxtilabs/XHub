-- depende: plataforma
-- Adjuntos (#41): metadatos de los archivos que viven en el almacenamiento S3-compatible.
-- El BYTE vive en S3 bajo clientes/{cliente}/…; aquí solo la referencia (key + metadatos).
-- Aislado por cliente con RLS, como el resto de la espina dorsal.
create table if not exists nucleo.adjuntos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references plataforma.clientes(id),
  key         text not null unique,       -- ruta del objeto en S3 (bajo el prefijo del cliente)
  nombre      text not null,
  tipo        text,                        -- content-type
  tamano      bigint,
  objeto_tipo text,                        -- 'ticket', 'persona', …
  objeto_id   text,
  subido_por  text,
  creado_en   timestamptz not null default now()
);
create index if not exists ix_adjuntos_objeto on nucleo.adjuntos (cliente_id, objeto_tipo, objeto_id);

alter table nucleo.adjuntos enable row level security;
alter table nucleo.adjuntos force row level security;
drop policy if exists aislar_adjuntos on nucleo.adjuntos;  -- idempotente ante re-corridas
create policy aislar_adjuntos on nucleo.adjuntos
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, delete on nucleo.adjuntos to xhub_app;
