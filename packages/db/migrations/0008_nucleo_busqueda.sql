-- depende: plataforma
-- Búsqueda en español sobre personas + identidades. Va al final: necesita personas
-- e identidades ya creadas (0004). Índice de búsqueda como tabla materializada por
-- trigger (una columna generada no puede leer de otra tabla).
create table if not exists nucleo.persona_busqueda (
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  texto text not null default '',
  vector tsvector,
  primary key (cliente_id, persona_id),
  foreign key (cliente_id, persona_id) references nucleo.personas(cliente_id, id) on delete restrict
);
create index if not exists ix_persona_busqueda_gin on nucleo.persona_busqueda using gin (vector);
alter table nucleo.persona_busqueda enable row level security;
alter table nucleo.persona_busqueda force row level security;
create policy aislar_persona_busqueda on nucleo.persona_busqueda
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update, delete on nucleo.persona_busqueda to xhub_app;

-- Recalcula el texto+vector de una persona desde su nombre + identidades.
create or replace function nucleo.refrescar_busqueda(p_cliente uuid, p_persona uuid) returns void as $$
declare t text;
begin
  select coalesce(pe.nombre,'') || ' ' || coalesce(string_agg(i.identificador, ' '), '')
    into t
    from nucleo.personas pe
    left join nucleo.identidades i on i.cliente_id=pe.cliente_id and i.persona_id=pe.id
   where pe.cliente_id=p_cliente and pe.id=p_persona
   group by pe.nombre;
  insert into nucleo.persona_busqueda (cliente_id, persona_id, texto, vector)
    values (p_cliente, p_persona, coalesce(t,''), to_tsvector('spanish', unaccent(coalesce(t,''))))
  on conflict (cliente_id, persona_id)
    do update set texto=excluded.texto, vector=excluded.vector;
end $$ language plpgsql;

-- Triggers: al insertar/actualizar persona o identidad, refrescar su búsqueda.
create or replace function nucleo.trg_busqueda_persona() returns trigger as $$
begin perform nucleo.refrescar_busqueda(new.cliente_id, new.id); return new; end $$ language plpgsql;
drop trigger if exists t_busqueda_persona on nucleo.personas;
create trigger t_busqueda_persona after insert or update on nucleo.personas
  for each row execute function nucleo.trg_busqueda_persona();

create or replace function nucleo.trg_busqueda_identidad() returns trigger as $$
begin perform nucleo.refrescar_busqueda(new.cliente_id, new.persona_id); return new; end $$ language plpgsql;
drop trigger if exists t_busqueda_identidad on nucleo.identidades;
create trigger t_busqueda_identidad after insert or update on nucleo.identidades
  for each row execute function nucleo.trg_busqueda_identidad();
