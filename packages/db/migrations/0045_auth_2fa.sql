-- depende: plataforma
-- 2FA OPCIONAL (Better Auth twoFactor plugin). El usuario lo activa desde su
-- configuración de seguridad; el login exige el segundo factor solo si está activo.
-- Esquema del plugin: columna en "user" + tabla "twoFactor" (secreto TOTP + códigos
-- de respaldo). El secreto lo cifra/gestiona Better Auth; aquí solo la estructura.
alter table "user" add column if not exists "twoFactorEnabled" boolean;

create table if not exists "twoFactor" (
  "id"          text not null primary key,
  "secret"      text not null,
  "backupCodes" text not null,
  "userId"      text not null references "user"("id") on delete cascade
);
create index if not exists ix_twofactor_user on "twoFactor" ("userId");
