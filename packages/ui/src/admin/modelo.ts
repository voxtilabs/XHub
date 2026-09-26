// Lógica de presentación del panel superadmin. Funciones PURAS y testeables:
// deciden qué se muestra a partir del estado, sin tocar el DOM ni la red.

export type EstadoCliente = "en_alta" | "activo" | "moroso" | "solo_lectura" | "suspendido";

export interface ClienteVista {
  id: string;
  nombre: string;
  estado: EstadoCliente;
  modulos: string[];         // encendidos
  usoApiMes: number;
  cuotaApiMes: number;
}

/** Color de estado según el ROL del sistema de diseño (no hex). */
export function rolDeEstado(e: EstadoCliente): "exito" | "senal" | "accion" | "neutro" {
  switch (e) {
    case "activo": return "exito";
    case "en_alta": return "senal";
    case "moroso": case "solo_lectura": return "accion";
    case "suspendido": return "neutro";
  }
}

/** Porcentaje de cuota usada, acotado 0..100. */
export function pctCuota(c: ClienteVista): number {
  if (c.cuotaApiMes <= 0) return 0;
  return Math.min(100, Math.round((c.usoApiMes / c.cuotaApiMes) * 100));
}

/** Nivel de alerta de consumo, para pintar la barra. */
export function nivelConsumo(c: ClienteVista): "ok" | "aviso" | "excedido" {
  const p = pctCuota(c);
  if (p >= 100) return "excedido";
  if (p >= 80) return "aviso";
  return "ok";
}

/** Un módulo se puede apagar solo si está encendido; el núcleo nunca aparece aquí. */
export function modulosApagables(todos: string[], encendidos: string[]): { modulo: string; encendido: boolean }[] {
  return todos
    .filter((m) => m !== "nucleo" && m !== "plataforma")
    .map((m) => ({ modulo: m, encendido: encendidos.includes(m) }));
}

/** Resumen para la cabecera del panel. */
export interface ResumenPlataforma { totalClientes: number; activos: number; enAlerta: number; }
export function resumen(clientes: ClienteVista[]): ResumenPlataforma {
  return {
    totalClientes: clientes.length,
    activos: clientes.filter((c) => c.estado === "activo").length,
    enAlerta: clientes.filter((c) => nivelConsumo(c) !== "ok").length,
  };
}
