-- Consumo de IA: una fila por llamada (triage, resumen, respuesta…). Sirve para que
-- el superadmin vea qué hizo la IA y cuánto costó, global y por cliente. cliente_id
-- es nulo si la llamada no ocurrió dentro del contexto de un cliente.
create table if not exists plataforma.ia_uso (
  id bigint generated always as identity primary key,
  cliente_id uuid references plataforma.clientes(id),
  tarea text not null,
  proveedor text not null,
  modelo text not null,
  tokens_prompt int not null default 0,
  tokens_salida int not null default 0,
  ms int not null default 0,
  ok boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists ix_ia_uso_cliente on plataforma.ia_uso (cliente_id, creado_en desc);
create index if not exists ix_ia_uso_creado on plataforma.ia_uso (creado_en desc);
grant select, insert on plataforma.ia_uso to xhub_app;
grant usage, select on sequence plataforma.ia_uso_id_seq to xhub_app;
