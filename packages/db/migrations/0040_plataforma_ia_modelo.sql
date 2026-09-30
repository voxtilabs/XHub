-- Modelo de IA configurable: un default de plataforma (settable desde el superadmin)
-- y un override por cliente. La LLAVE del proveedor nunca vive aquí (va por env);
-- esto es solo el nombre del modelo (p.ej. google/gemma-3-12b-it en OpenRouter).
create table if not exists plataforma.ia_config (
  id             int primary key default 1,
  modelo_default text,
  actualizado_en timestamptz not null default now(),
  constraint ia_config_una_fila check (id = 1)
);
insert into plataforma.ia_config (id, modelo_default) values (1, null) on conflict (id) do nothing;
alter table plataforma.clientes add column if not exists ia_modelo text;  -- override por cliente (null = usa el default)
grant select, insert, update on plataforma.ia_config to xhub_app;
