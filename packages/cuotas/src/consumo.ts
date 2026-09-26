import Redis from "ioredis";

let _r: Redis | null = null;
function redis(): Redis {
  if (!_r) { _r = new Redis(process.env.REDIS_URL!); }
  return _r;
}

/**
 * Registra un uso de la API para el tablero de consumo. Vivo en Redis; un job
 * lo vuelca periódicamente a métricas diarias (fuera de alcance de esta pieza).
 * El día es el de negocio (America/Santiago), como texto.
 */
export function diaNegocio(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export async function registrarUso(clienteId: string, ruta: string, ahora = new Date()): Promise<void> {
  const dia = diaNegocio(ahora);
  const r = redis();
  await r.hincrby(`consumo:${clienteId}:${dia}`, "total", 1);
  await r.hincrby(`consumo:${clienteId}:${dia}`, `ruta:${ruta}`, 1);
  await r.expire(`consumo:${clienteId}:${dia}`, 60 * 60 * 24 * 40);
}

export interface ConsumoDia { dia: string; total: number; porRuta: Record<string, number>; }
export async function consumoDelDia(clienteId: string, ahora = new Date()): Promise<ConsumoDia> {
  const dia = diaNegocio(ahora);
  const h = await redis().hgetall(`consumo:${clienteId}:${dia}`);
  const porRuta: Record<string, number> = {};
  for (const [k, v] of Object.entries(h)) if (k.startsWith("ruta:")) porRuta[k.slice(5)] = Number(v);
  return { dia, total: Number(h.total ?? 0), porRuta };
}
