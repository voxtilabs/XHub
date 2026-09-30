-- Idempotencia de escrituras de la API pública: (llave, clave) -> respuesta guardada.
-- Reintentar un POST con el mismo Idempotency-Key devuelve la MISMA respuesta y NO
-- repite el efecto. Acotada por llave_id: una llave jamás lee la clave de otra.
create table if not exists plataforma.idempotencia (
  llave_id   uuid not null references plataforma.api_keys(id) on delete cascade,
  clave      text not null,
  metodo     text not null,
  ruta       text not null,
  estado     int  not null,
  respuesta  text not null,
  creado_en  timestamptz not null default now(),
  primary key (llave_id, clave)
);
-- Barrido de reclamos viejos: la ventana de idempotencia son 24 h (índice para limpiar).
create index if not exists idx_idempotencia_creado on plataforma.idempotencia (creado_en);
grant select, insert on plataforma.idempotencia to xhub_app;
