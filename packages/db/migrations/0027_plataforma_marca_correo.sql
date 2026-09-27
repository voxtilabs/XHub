-- Identidad de correo saliente del cliente (white-label). El SMTP es único (plataforma,
-- por env); esto es solo el "From" que ve el destinatario del correo.
alter table plataforma.clientes_marca add column if not exists correo_soporte text;
