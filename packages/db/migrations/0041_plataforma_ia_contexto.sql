-- Contexto/instrucciones de negocio para el LLM, por cliente. Se antepone al prompt
-- de resumen y de sugerencia para que la IA conozca el rubro, tono y datos del cliente.
alter table plataforma.clientes add column if not exists ia_contexto text;
