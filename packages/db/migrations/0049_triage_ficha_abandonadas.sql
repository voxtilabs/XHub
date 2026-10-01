-- depende: plataforma
-- Regla de negocio GENERAL (por cliente): qué hacer con las conversaciones ABANDONADAS
-- que entran por voxia. Por defecto se registran como todas (ficha360 completa). Si un
-- cliente lo apaga (p.ej. Municipalidad de Temuco), las abandonadas SOLO generan el
-- ticket y NO se registran en la línea de tiempo de la persona; las no abandonadas sí.
alter table ticket_triage_config
  add column if not exists ficha_en_abandonadas boolean not null default true;
