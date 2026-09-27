-- Planes (plantillas de suscripción): módulos habilitados + tope de usuarios + cuota
-- mensual de API. El superadmin los aplica a un cliente de un clic (§9 planes).
create table if not exists plataforma.planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  modulos text[] not null default '{}',
  limite_usuarios int not null default 5,
  cuota_mensual bigint not null default 100000,
  creado_en timestamptz not null default now()
);
grant select, insert, update, delete on plataforma.planes to xhub_app;
alter table plataforma.clientes add column if not exists plan_id uuid references plataforma.planes(id);
