// Consola X5 — primitivas de estilo de xHub.
// Devuelven estilos inline desde tokens (sin hex sueltos: todo var(--...)).
// Ver docs/diseno/SISTEMA.md.

export type Rol = "accion" | "senal" | "exito";

/** Botón primario = LA ACCIÓN. Naranja, uno por vista. */
export const botonPrimario = (): Record<string, string> => ({
  background: "var(--accion)",
  color: "var(--texto-accion)",
  border: "none",
  borderRadius: "var(--radio-pill)",
  height: "3rem",
  padding: "0 1.25rem",
  fontFamily: "var(--fuente)",
  fontWeight: "600",
  cursor: "pointer",
});

/** Botón secundario = vidrio, no compite con la acción. */
export const botonSecundario = (): Record<string, string> => ({
  background: "var(--vidrio)",
  color: "var(--texto)",
  border: "1px solid var(--borde)",
  borderRadius: "var(--radio-pill)",
  height: "3rem",
  padding: "0 1.25rem",
  fontFamily: "var(--fuente)",
  fontWeight: "600",
  cursor: "pointer",
});

/** Panel de vidrio. */
export const panelVidrio = (): Record<string, string> => ({
  background: "var(--vidrio)",
  border: "1px solid var(--borde)",
  borderRadius: "var(--radio-xl)",
  padding: "1.25rem",
  color: "var(--texto)",
});

/** Micro-etiqueta = LA SEÑAL. Cyan, mayúsculas, nunca clickeable. */
export const etiquetaSenal = (): Record<string, string> => ({
  color: "var(--senal)",
  fontFamily: "var(--fuente)",
  fontSize: "0.75rem",
  fontWeight: "900",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
});

export const TOKENS_URL = new URL("./tokens.css", import.meta.url).href;
