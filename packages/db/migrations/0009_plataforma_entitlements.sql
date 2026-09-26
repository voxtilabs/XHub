-- depende: plataforma
-- Entitlements: qué módulos tiene encendidos cada cliente. El corazón del negocio.
-- Vive en plataforma (cross-cliente lo gestiona el superadmin), no en un módulo.
create table if not exists plataforma.entitlements (
  cliente_id uuid not null references plataforma.clientes(id),
  modulo text not null,
  encendido boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (cliente_id, modulo)
);
grant select, insert, update on plataforma.entitlements to xhub_app;

-- Llaves de API por cliente. Se muestra el token UNA vez; solo el hash se guarda.
-- El cliente se deduce DE LA LLAVE, nunca de una cabecera → cruzar clientes imposible.
create table if not exists plataforma.api_keys (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text not null,
  hash text not null unique,          -- sha256 del token
  prefijo text not null,              -- primeros chars visibles para identificar
  scopes text[] not null default '{}',
  creada_en timestamptz not null default now(),
  ultimo_uso timestamptz,
  revocada_en timestamptz
);
create index if not exists ix_apikeys_cliente on plataforma.api_keys (cliente_id) where revocada_en is null;
grant select, insert, update on plataforma.api_keys to xhub_app;
