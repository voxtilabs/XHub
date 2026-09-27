-- Marca blanca (white-label) por cliente. La gobierna la PLATAFORMA (superadmin); el
-- panel del cliente se pinta con ella. Vive en el esquema plataforma, junto a clientes.
create table if not exists plataforma.clientes_marca (
  cliente_id uuid primary key references plataforma.clientes(id) on delete cascade,
  nombre_marca text,
  logo_url text,            -- URL o data URI (svg/png chico)
  color_primario text,      -- hex #rrggbb
  color_acento text,        -- hex #rrggbb
  actualizado_en timestamptz not null default now()
);
grant select, insert, update on plataforma.clientes_marca to xhub_app;
