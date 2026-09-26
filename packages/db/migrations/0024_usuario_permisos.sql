-- Permisos por usuario: el admin del cliente reparte a SUS usuarios lo que pueden
-- hacer (ver bandeja, gestionar tickets, ver la ficha 360, etc.). El admin del
-- cliente tiene todo por su rol; el usuario solo lo que aquí se le concede.
-- usuario_id apunta a "user".id (Better Auth); sin FK para no acoplar el esquema
-- de auth con el de plataforma (la baja de usuario limpia por aplicación).
create table if not exists plataforma.usuario_permisos (
  usuario_id text not null,
  permiso text not null,
  otorgado_en timestamptz not null default now(),
  primary key (usuario_id, permiso)
);
grant select, insert, delete on plataforma.usuario_permisos to xhub_app;
