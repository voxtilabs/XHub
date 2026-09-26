-- Fundación de plataforma. No depende de nadie.
create schema if not exists plataforma;

-- Rol de aplicación: NO superusuario, NO bypassrls. Con RLS activo, un rol
-- superusuario haría que Postgres ni evalúe las políticas (ADR 0003).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'xhub_app') then
    create role xhub_app nologin nosuperuser nobypassrls;
  end if;
end $$;

grant usage on schema plataforma to xhub_app;

-- Clientes (tenants). El ciclo de vida vive aquí (#21).
create table if not exists plataforma.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'en_alta'
    check (estado in ('en_alta','activo','moroso','solo_lectura','suspendido')),
  creado_en timestamptz not null default now()
);
grant select, insert, update on plataforma.clientes to xhub_app;
