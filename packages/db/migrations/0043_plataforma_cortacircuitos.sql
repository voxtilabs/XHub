-- depende: plataforma
-- Cortacircuitos PERSISTENTE por instancia (#53) en el camino del sondeo: si una
-- instancia falla sostenidamente, el breaker ABRE y el scheduler deja de llamarla
-- hasta la prueba de reapertura. Complementa el Cortacircuitos en memoria de cliente.ts.
alter table plataforma.instancias_xcontact
  add column if not exists fallos_consecutivos int not null default 0,
  add column if not exists corte_hasta timestamptz,    -- breaker abierto hasta este instante
  add column if not exists ultima_causa text;          -- causa legible (español) del último fallo (#66)
