-- depende: plataforma
-- Contexto de IA MÁS RICO que el system prompt (ia_contexto): datos estructurados del
-- negocio + ejemplos few-shot. Se anteponen a los prompts de resumen/sugerencia del
-- cliente. Config de cliente (como ia_contexto): sin RLS, siempre filtrada por cliente_id;
-- el admin del cliente solo toca lo suyo (clienteId sale de la sesión, nunca del body).

-- Datos estructurados del negocio: pares etiqueta → valor (rubro, horarios, sucursales,
-- qué derivar a dónde, qué NO prometer, …).
create table if not exists plataforma.ia_datos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  etiqueta text not null,
  valor text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists ix_ia_datos_cliente on plataforma.ia_datos (cliente_id, orden);

-- Ejemplos few-shot: entrada → respuesta ideal, por ámbito (resumen | respuesta | todos).
create table if not exists plataforma.ia_ejemplos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references plataforma.clientes(id),
  entrada text not null,
  salida text not null,
  ambito text not null default 'todos' check (ambito in ('resumen','respuesta','todos')),
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists ix_ia_ejemplos_cliente on plataforma.ia_ejemplos (cliente_id, orden);

grant select, insert, update, delete on plataforma.ia_datos to xhub_app;
grant select, insert, update, delete on plataforma.ia_ejemplos to xhub_app;
