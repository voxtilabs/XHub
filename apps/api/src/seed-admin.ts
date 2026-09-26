import { auth } from "./auth.js";

/**
 * Crea la PRIMERA cuenta (superadmin) por consola — el registro público está apagado.
 * Usa la API server de Better Auth (con signUp deshabilitado en el endpoint HTTP, el
 * camino server es el confiable). Idempotente: si el email ya existe, no hace nada.
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Superadmin";
  if (!email || !password) {
    process.stderr.write("[seed] faltan SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD\n");
    process.exit(1);
  }
  const ctx = await auth.$context;
  // internalAdapter es una API interna de Better Auth con tipos estrictos/variables entre
  // versiones; la usamos por consola (crear la primera cuenta) con casts acotados.
  const ia = ctx.internalAdapter as unknown as {
    findUserByEmail(email: string): Promise<unknown>;
    createUser(data: Record<string, unknown>): Promise<{ id?: string; user?: { id: string } }>;
    linkAccount(data: Record<string, unknown>): Promise<unknown>;
  };
  if (await ia.findUserByEmail(email)) {
    process.stdout.write(`[seed] ya existe: ${email}\n`);
    process.exit(0);
  }
  const hash = await ctx.password.hash(password);
  const creado = await ia.createUser({ email, name, emailVerified: true });
  const userId = creado.user?.id ?? creado.id!;
  await ia.linkAccount({ userId, providerId: "credential", accountId: userId, password: hash });
  process.stdout.write(`[seed] superadmin creado: ${email}\n`);
  process.exit(0);
}

main().catch((e) => { process.stderr.write(`[seed] error: ${(e as Error).message}\n`); process.exit(1); });
