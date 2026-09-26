import { join } from "node:path";
import { migrar, cargarDe, ordenar } from "./migraciones.js";
import { cerrarPool } from "./pool.js";

/**
 * Corredor de migraciones para el arranque del contenedor (XHUB_PROCESO=migrate).
 * Corre como el rol DUEÑO (DATABASE_URL), valida el orden topológico ANTES de tocar
 * la base y aplica solo lo pendiente. Idempotente: correrlo dos veces no hace daño.
 * Es lo que hace `docker compose up` reproducible en una VPS limpia (ADR 0007).
 */
const dir = process.env.XHUB_MIGRACIONES_DIR ?? join(process.cwd(), "packages/db/migrations");

async function main(): Promise<void> {
  process.stdout.write(`[xhub-migrar] migraciones desde ${dir}\n`);
  const migs = cargarDe(dir);
  ordenar(migs); // aborta ANTES de escribir si hay un ciclo o una dependencia inexistente
  const aplicadas = await migrar(migs);
  process.stdout.write(
    aplicadas.length === 0
      ? "[xhub-migrar] sin pendientes; la base está al día\n"
      : `[xhub-migrar] aplicadas ${aplicadas.length}: ${aplicadas.join(", ")}\n`,
  );
}

main()
  .then(() => cerrarPool())
  .then(() => process.exit(0))
  .catch(async (e) => {
    process.stderr.write(`[xhub-migrar] ERROR: ${(e as Error).message}\n`);
    await cerrarPool().catch(() => {});
    process.exit(1);
  });
