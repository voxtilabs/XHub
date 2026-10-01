-- depende: plataforma
-- Identificador externo del cliente en XContact (#58): con qué id se le conoce allá.
-- El vínculo cliente↔instancia ya es la propia fila (cliente_id); esto agrega CON QUÉ
-- identificador se le conoce en la instancia, para resolverlo en cada operación.
alter table plataforma.instancias_xcontact
  add column if not exists externo_id text;
