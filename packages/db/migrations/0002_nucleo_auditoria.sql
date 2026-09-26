-- depende: plataforma
-- Bitácora de auditoría: append-only, encadenada por hash. La evidencia cuando
-- algo se discute. No se puede editar ni borrar (trigger). ADR: leyes de la casa 8.
create table if not exists nucleo.auditoria (
  seq bigserial primary key,
  cliente_id uuid,                       -- null = acción de plataforma
  actor_tipo text not null,              -- 'usuario' | 'plataforma' | 'sistema' | 'agente'
  actor_id text,
  accion text not null,
  recurso text,
  recurso_id text,
  resultado text not null,               -- 'ok' | 'denegado' | 'error'
  metadata jsonb not null default '{}',
  hash_prev text,
  hash text not null,
  creado_en timestamptz not null default now()
);
grant select, insert on nucleo.auditoria to xhub_app;

-- Cada fila encadena con la anterior: hash = sha256(seq|prev|contenido).
create or replace function nucleo.auditoria_encadenar() returns trigger as $$
declare prev text;
begin
  select hash into prev from nucleo.auditoria order by seq desc limit 1;
  new.hash_prev := prev;
  new.hash := encode(digest(
    coalesce(prev,'') || '|' || new.actor_tipo || '|' || coalesce(new.actor_id,'') ||
    '|' || new.accion || '|' || coalesce(new.recurso,'') || '|' ||
    coalesce(new.recurso_id,'') || '|' || new.resultado || '|' || new.metadata::text,
    'sha256'), 'hex');
  return new;
end $$ language plpgsql;

drop trigger if exists t_auditoria_encadenar on nucleo.auditoria;
create trigger t_auditoria_encadenar before insert on nucleo.auditoria
  for each row execute function nucleo.auditoria_encadenar();

-- Prohibido editar o borrar: es append-only.
create or replace function nucleo.auditoria_solo_append() returns trigger as $$
begin raise exception 'La auditoría es append-only: no se puede % ', tg_op; end $$ language plpgsql;

drop trigger if exists t_auditoria_no_update on nucleo.auditoria;
create trigger t_auditoria_no_update before update or delete on nucleo.auditoria
  for each row execute function nucleo.auditoria_solo_append();
