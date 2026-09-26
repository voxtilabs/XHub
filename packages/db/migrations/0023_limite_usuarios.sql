-- Tope de usuarios por cliente: lo fija la PLATAFORMA (nosotros). El admin del
-- cliente puede crear/gestionar sus propios usuarios hasta este límite; de ahí sale
-- la jerarquía del negocio (plataforma acota → admin de cliente reparte).
create table if not exists plataforma.limite_usuarios (
  cliente_id uuid not null primary key references plataforma.clientes(id),
  limite int not null,
  fijado_en timestamptz not null default now()
);
grant select, insert, update on plataforma.limite_usuarios to xhub_app;
