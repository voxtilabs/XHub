/** Manifiesto de un módulo. Lo que declara para poder registrarse. */
export interface Manifiesto {
  nombre: string;                 // único: "nucleo", "conector", "tickets", "crm"
  nucleo?: boolean;               // los 4 del núcleo no se apagan (#e4/entitlements)
  depende: string[];              // otros módulos requeridos
  permisos: string[];             // catálogo de permisos que aporta (ADR 0006)
  eventos: string[];              // eventos que emite
}

/** Un módulo apagable puede negarse por cliente; el núcleo no. */
export interface Modulo {
  manifiesto: Manifiesto;
}
