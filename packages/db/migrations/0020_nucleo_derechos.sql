-- depende: plataforma
-- Derechos del titular (Ley 21.719): supresión = anonimizar, no borrar la fila.
alter table nucleo.personas add column if not exists suprimida_en timestamptz;

-- Registro de solicitudes de derechos (acceso, rectificación, supresión). Evidencia.
create table if not exists nucleo.derechos_solicitudes (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  persona_id uuid not null,
  tipo text not null check (tipo in ('acceso','rectificacion','supresion')),
  motivo text not null,
  ejecutada_en timestamptz not null default now()
);
alter table nucleo.derechos_solicitudes enable row level security;
alter table nucleo.derechos_solicitudes force row level security;
create policy aislar_derechos on nucleo.derechos_solicitudes
  using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)
  with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert on nucleo.derechos_solicitudes to xhub_app;

-- Supresión vs. línea de tiempo append-only: la evidencia no se borra, pero el
-- CONTENIDO personal sí debe irse. Se abre UN camino acotado y con llave: bajo la
-- bandera de sesión app.supresion='on' se permite vaciar SOLO resumen y meta de una
-- interacción; el hecho, su seq y su tipo quedan como registro. Fuera de ese camino,
-- la línea sigue siendo inmutable. La fusión (repunte de persona_id) se conserva igual.
create or replace function nucleo.interacciones_solo_append() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La línea de tiempo es append-only: no se puede DELETE';
  end if;
  -- fusión: lo único que cambia es persona_id
  if (to_jsonb(new) - 'persona_id') is not distinct from (to_jsonb(old) - 'persona_id') then
    return new;
  end if;
  -- supresión (Ley 21.719): redacción con llave. SOLO resumen→null y meta→'{}';
  -- todo lo demás idéntico (incluido persona_id, tipo, ocurrio_en, seq).
  if current_setting('app.supresion', true) = 'on'
     and (to_jsonb(new) - 'resumen' - 'meta') is not distinct from (to_jsonb(old) - 'resumen' - 'meta')
     and new.resumen is null and new.meta = '{}'::jsonb then
    return new;
  end if;
  raise exception 'La línea de tiempo es append-only: solo se permite repuntar persona_id (fusión) o redactar contenido en una supresión';
end $$ language plpgsql;

-- El rol de app solo puede tocar las columnas de contenido; la llave del trigger
-- gobierna el "cuándo", este grant gobierna el "qué". Las dos capas coinciden.
grant update (resumen, meta) on nucleo.interacciones to xhub_app;
