-- depende: plataforma
-- Etiquetas y campos personalizados, compartidos sobre personas y objetos de módulo.

-- Etiquetas: color por ROL del sistema de diseño, no hex libre (la ley "sin hex").
create table if not exists nucleo.etiquetas (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text not null,
  color_rol text not null default 'neutro' check (color_rol in ('accion','senal','exito','neutro')),
  creado_en timestamptz not null default now(),
  primary key (id),
  unique (cliente_id, id)
);
create unique index if not exists ux_etiquetas_nombre on nucleo.etiquetas (cliente_id, lower(nombre));
alter table nucleo.etiquetas enable row level security;
alter table nucleo.etiquetas force row level security;
create policy aislar_etiquetas on nucleo.etiquetas
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.etiquetas to xhub_app;

create table if not exists nucleo.persona_etiquetas (
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  etiqueta_id uuid not null,
  aplicada_en timestamptz not null default now(),
  primary key (cliente_id, persona_id, etiqueta_id),
  foreign key (cliente_id, persona_id) references nucleo.personas(cliente_id, id) on delete restrict,
  foreign key (cliente_id, etiqueta_id) references nucleo.etiquetas(cliente_id, id) on delete restrict
);
alter table nucleo.persona_etiquetas enable row level security;
alter table nucleo.persona_etiquetas force row level security;
create policy aislar_persona_etiquetas on nucleo.persona_etiquetas
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.persona_etiquetas to xhub_app;

-- Campos personalizados por cliente y tipo de objeto.
create table if not exists nucleo.campos_def (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  objeto_tipo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('texto','numero','fecha','bool')),
  primary key (id),
  unique (cliente_id, id)
);
create unique index if not exists ux_campos_nombre on nucleo.campos_def (cliente_id, objeto_tipo, lower(nombre));
alter table nucleo.campos_def enable row level security;
alter table nucleo.campos_def force row level security;
create policy aislar_campos_def on nucleo.campos_def
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.campos_def to xhub_app;

create table if not exists nucleo.campos_valor (
  cliente_id uuid not null references plataforma.clientes(id),
  objeto_tipo text not null,
  objeto_id text not null,
  campo_id uuid not null,
  valor jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (cliente_id, objeto_tipo, objeto_id, campo_id),
  foreign key (cliente_id, campo_id) references nucleo.campos_def(cliente_id, id) on delete restrict
);
alter table nucleo.campos_valor enable row level security;
alter table nucleo.campos_valor force row level security;
create policy aislar_campos_valor on nucleo.campos_valor
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.campos_valor to xhub_app;
