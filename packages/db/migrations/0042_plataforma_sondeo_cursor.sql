-- depende: plataforma
-- Sondeo incremental por instancia (#59) + señal de deriva de la reconciliación (#61).
-- El cursor hace el sondeo REANUDABLE: detenerlo a mitad y volver no pierde ni duplica
-- (la ingesta ya es idempotente por dedupeId; el cursor solo evita reprocesar de más).

alter table plataforma.instancias_xcontact
  add column if not exists intervalo_sondeo_seg int not null default 300,
  add column if not exists sondeo_activo boolean not null default false,
  add column if not exists ultimo_sondeo timestamptz;

-- Cursor por (instancia, tipo de objeto). `cursor` es la última clave vista
-- (para contactos: el mayor id externo procesado). Reanudable entre corridas.
create table if not exists plataforma.sync_cursor (
  instancia_id uuid not null references plataforma.instancias_xcontact(id) on delete cascade,
  tipo         text not null,                 -- 'contactos', 'tags', ...
  cursor       text,                           -- última clave procesada (id externo)
  ultimo_sync  timestamptz,
  items_ultimo int not null default 0,
  vueltas      bigint not null default 0,
  primary key (instancia_id, tipo)
);
grant select, insert, update on plataforma.sync_cursor to xhub_app;

-- Deriva detectada por la reconciliación de baja frecuencia (#61): conteo local vs
-- remoto por tipo. Nunca borra en XContact; solo señala para reparar la copia.
create table if not exists plataforma.sync_deriva (
  instancia_id  uuid not null references plataforma.instancias_xcontact(id) on delete cascade,
  tipo          text not null,
  conteo_local  int,
  conteo_remoto int,
  deriva        int,                           -- remoto - local (0 = en sincronía)
  detectada_en  timestamptz not null default now(),
  reparada_en   timestamptz,
  primary key (instancia_id, tipo)
);
grant select, insert, update on plataforma.sync_deriva to xhub_app;
