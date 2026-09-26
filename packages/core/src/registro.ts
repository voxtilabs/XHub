import type { Manifiesto, Modulo } from "./modulo.js";

/**
 * Registro de módulos. Valida al arrancar: nombres duplicados, dependencias
 * inexistentes y ciclos ABORTAN el arranque — no se descubren en producción.
 */
export class RegistroModulos {
  private mods = new Map<string, Modulo>();

  registrar(m: Modulo): void {
    const n = m.manifiesto.nombre;
    if (this.mods.has(n))
      throw new Error(`Módulo duplicado: "${n}" ya está registrado`);
    this.mods.set(n, m);
  }

  /** Valida el grafo completo. Llamar tras registrar todos. */
  validar(): void {
    for (const m of this.mods.values())
      for (const d of m.manifiesto.depende)
        if (!this.mods.has(d))
          throw new Error(`"${m.manifiesto.nombre}" depende de "${d}", que no está registrado`);
    // ciclos
    const visto = new Set<string>();
    const enCurso = new Set<string>();
    const visitar = (n: string, cadena: string[]) => {
      if (visto.has(n)) return;
      if (enCurso.has(n))
        throw new Error(`Ciclo de módulos: ${[...cadena, n].join(" → ")}`);
      enCurso.add(n);
      for (const d of this.mods.get(n)!.manifiesto.depende) visitar(d, [...cadena, n]);
      enCurso.delete(n);
      visto.add(n);
    };
    for (const n of this.mods.keys()) visitar(n, []);
    // permisos únicos entre módulos
    const dueño = new Map<string, string>();
    for (const m of this.mods.values())
      for (const p of m.manifiesto.permisos) {
        if (dueño.has(p))
          throw new Error(`Permiso "${p}" declarado por "${dueño.get(p)}" y "${m.manifiesto.nombre}"`);
        dueño.set(p, m.manifiesto.nombre);
      }
  }

  lista(): Manifiesto[] { return [...this.mods.values()].map((m) => m.manifiesto); }
  tiene(nombre: string): boolean { return this.mods.has(nombre); }

  /** Módulos que un cliente ve, según sus entitlements. El núcleo siempre. */
  activosPara(entitlements: Set<string>): string[] {
    return this.lista()
      .filter((m) => m.nucleo || entitlements.has(m.nombre))
      .map((m) => m.nombre);
  }
}
