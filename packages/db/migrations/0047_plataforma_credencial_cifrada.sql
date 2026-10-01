-- depende: plataforma
-- Bóveda de credenciales (#139): el secreto de acceso a XContact se guarda CIFRADO en
-- sobre (credencial_cifrada), no como nombre de env var. Así una instancia dada de alta
-- desde el panel guarda su credencial sin desplegar nada. credencial_ref se mantiene para
-- las instancias configuradas a mano. Un volcado de la base no revela ningún secreto.
alter table plataforma.instancias_xcontact
  add column if not exists credencial_cifrada text;
