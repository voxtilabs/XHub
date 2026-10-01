-- depende: plataforma
-- Retención de datos por plan (#105). El plan fija el TECHO de días que se conservan
-- los datos personales; null = ilimitado. La excepción por cliente solo puede ACORTAR
-- (nunca exceder lo permitido por el plan) — eso se resuelve en código (retencionEfectiva).
alter table plataforma.planes   add column if not exists retencion_dias int;
alter table plataforma.clientes add column if not exists retencion_dias int;

comment on column plataforma.planes.retencion_dias   is 'Máximo de días a conservar; null = ilimitado. Es el techo.';
comment on column plataforma.clientes.retencion_dias is 'Excepción del cliente; solo puede acortar respecto del plan. null = usa el plan.';
