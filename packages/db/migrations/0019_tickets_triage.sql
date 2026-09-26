-- depende: plataforma
-- Triage: cada cliente decide CÓMO se convierten las conversaciones en tickets.
create table if not exists ticket_triage_config (
  cliente_id uuid not null primary key references plataforma.clientes(id),
  modo text not null default 'sugerir' check (modo in ('automatico','sugerir','manual')),
  umbral numeric(3,2) not null default 0.70 check (umbral >= 0 and umbral <= 1),
  actualizado_en timestamptz not null default now()
);
alter table ticket_triage_config enable row level security; alter table ticket_triage_config force row level security;
create policy aislar_triage on ticket_triage_config using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert, update on ticket_triage_config to xhub_app;

-- Registro de conversaciones evaluadas (idempotencia + auditoría de la decisión).
create table if not exists ticket_triage_log (
  cliente_id uuid not null,
  dedupe_id text not null,           -- id de la conversación (del conector)
  necesita_ticket boolean not null,
  confianza numeric(3,2) not null,
  accion text not null,              -- creado | sugerido | descartado
  ticket_id uuid,
  fuente text not null,              -- ia | reglas
  motivo text,
  creado_en timestamptz not null default now(),
  primary key (cliente_id, dedupe_id)
);
alter table ticket_triage_log enable row level security; alter table ticket_triage_log force row level security;
create policy aislar_triage_log on ticket_triage_log using (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid) with check (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid);
grant select, insert on ticket_triage_log to xhub_app;
