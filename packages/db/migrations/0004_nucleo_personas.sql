-- depende: plataforma
-- Espina dorsal: personas e identidades por canal (ADR 0005).
-- EL TELÉFONO NO ES LA LLAVE: la llave es la identidad por canal.
-- Dependencia dura: personas expone unique(cliente_id, id) para las FK compuestas
-- de tenant que usan interacciones/enlaces/etiquetas (0005+).

create table if not exists nucleo.personas (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  nombre text,
  fusionada_en uuid,
  creado_en timestamptz not null default now(),
  primary key (id),
  unique (cliente_id, id),                                    -- ancla de FK compuesta
  foreign key (cliente_id, fusionada_en)
    references nucleo.personas(cliente_id, id)
);

alter table nucleo.personas enable row level security;
alter table nucleo.personas force row level security;
create policy aislar_personas on nucleo.personas
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);

-- Persona NUNCA se hard-borra: la fusión es un puntero. Protege la evidencia
-- (interacciones) contra cascadas. Sin delete para el rol de app.
grant select, insert, update on nucleo.personas to xhub_app;
revoke delete on nucleo.personas from xhub_app;

create table if not exists nucleo.identidades (
  seq bigserial primary key,
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  canal text not null check (canal in ('telefono','email','rut','xcontact','webchat','instagram','messenger')),
  identificador text not null,
  creado_en timestamptz not null default now(),
  unique (cliente_id, canal, identificador),
  foreign key (cliente_id, persona_id)
    references nucleo.personas(cliente_id, id) on delete restrict
);
create index if not exists ix_identidades_persona on nucleo.identidades (cliente_id, persona_id, seq);

alter table nucleo.identidades enable row level security;
alter table nucleo.identidades force row level security;
create policy aislar_identidades on nucleo.identidades
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update on nucleo.identidades to xhub_app;
grant usage, select on sequence nucleo.identidades_seq_seq to xhub_app;

-- Privilegios por defecto: cada bigserial futuro necesita usar su secuencia.
alter default privileges in schema nucleo grant usage, select on sequences to xhub_app;
