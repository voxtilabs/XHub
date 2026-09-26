-- depende: plataforma
-- Webhooks salientes hacia el cliente. Firma estilo Stripe, secreto rotable.
create table if not exists plataforma.webhooks (
  id uuid not null default gen_random_uuid() primary key,
  cliente_id uuid not null references plataforma.clientes(id),
  url text not null,
  eventos text[] not null default '{}',
  secreto text not null,               -- whsec_...
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
grant select, insert, update, delete on plataforma.webhooks to xhub_app;

-- Cola de entregas: el consumidor ENCOLA, jamás HTTP en la transacción (ley 7).
create table if not exists plataforma.webhook_entregas (
  id uuid not null default gen_random_uuid() primary key,
  webhook_id uuid not null references plataforma.webhooks(id),
  cliente_id uuid not null references plataforma.clientes(id),
  evento text not null,
  payload jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','entregado','fallido')),
  intentos int not null default 0,
  ultimo_codigo int,
  proxima_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);
create index if not exists ix_webhook_entregas_pend on plataforma.webhook_entregas (proxima_en) where estado='pendiente';
grant select, insert, update on plataforma.webhook_entregas to xhub_app;
