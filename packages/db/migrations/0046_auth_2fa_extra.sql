-- depende: plataforma
-- Better Auth 1.7.x pide en "twoFactor" columnas extra para el rastreo de verificación
-- y el bloqueo por intentos fallidos. Sin ellas, el plugin lanza "schema mismatch" y
-- rompe TODO el sign-in. Las agregamos con defaults seguros.
alter table "twoFactor"
  add column if not exists "verified" boolean not null default false,
  add column if not exists "failedVerificationCount" integer not null default 0,
  add column if not exists "lockedUntil" timestamptz;
