-- depende: plataforma
-- Administradores de plataforma (X5/VoxTi): cruzan clientes, permisos plataforma.*
create table if not exists plataforma.admin_tokens (
  id uuid not null default gen_random_uuid() primary key,
  nombre text not null,
  hash text not null unique,           -- sha256 del token
  prefijo text not null,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz,
  revocado_en timestamptz
);
-- Sin RLS: es cross-cliente por diseño. Solo el rol de app lee/escribe.
grant select, insert, update on plataforma.admin_tokens to xhub_app;

-- Override de cuota mensual de API por cliente (el superadmin lo fija).
create table if not exists plataforma.cuota_override (
  cliente_id uuid not null primary key references plataforma.clientes(id),
  limite_mensual bigint not null,
  fijado_en timestamptz not null default now()
);
grant select, insert, update on plataforma.cuota_override to xhub_app;
