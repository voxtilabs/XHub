/**
 * Traductor de roles de SESIÓN → capacidad. Este es el ÚNICO lugar del API donde el rol
 * se compara literalmente (ADR 0006 / ley de la casa nº2: el rol no decide en el resto
 * del código; se pregunta por permiso/capacidad). Los guards de ruta usan estos helpers.
 */
export type RolSesion = string | null | undefined;

/** ¿Es un usuario de PLATAFORMA (X5/VoxTi, cruza clientes)? */
export const esPlataforma = (rol: RolSesion): boolean => rol === "plataforma";

/** ¿Es el ADMINISTRADOR de un cliente (acceso total dentro de SU cliente)? */
export const esAdminCliente = (rol: RolSesion): boolean => rol === "admin_cliente";
