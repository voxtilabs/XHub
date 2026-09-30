-- Registro de instancias de XContact por cliente (#57). Modelo de N instancias: una
-- por cliente o una compartida (cliente_id null). La VERSIÓN de API se fija por
-- instancia (ADR 0008). El SECRETO nunca vive aquí: se guarda una REFERENCIA
-- (nombre de la variable de entorno). Se guarda el último scorecard de salud.
create table if not exists plataforma.instancias_xcontact (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references plataforma.clientes(id) on delete cascade,  -- null = compartida
  nombre         text not null,
  host           text not null,
  version_api    text not null default 'v5',
  usuario        text,                 -- login de supervisor (no es secreto)
  credencial_ref text,                 -- NOMBRE de la env var con el secreto, jamás el secreto
  estado_salud   text not null default 'sin_probar',
  ultima_prueba  timestamptz,
  resumen        jsonb,                -- último scorecard del probe
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create index if not exists ix_instancias_cliente on plataforma.instancias_xcontact (cliente_id);
grant select, insert, update, delete on plataforma.instancias_xcontact to xhub_app;
