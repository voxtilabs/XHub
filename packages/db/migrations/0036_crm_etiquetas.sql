-- depende: plataforma
-- Etiquetas (labels) del deal, al estilo Pipedrive.
alter table crm_oportunidades add column if not exists etiquetas text[] not null default '{}';
