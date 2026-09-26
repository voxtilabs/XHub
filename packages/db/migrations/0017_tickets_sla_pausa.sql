-- depende: plataforma
-- SLA que se PAUSA mientras el ticket espera al cliente (estado 'pendiente').
alter table tickets add column if not exists sla_pausa_desde timestamptz;
alter table tickets add column if not exists sla_pausa_acum_seg bigint not null default 0;
alter table tickets add column if not exists urgencia_detectada text;  -- baja/media/alta por análisis
