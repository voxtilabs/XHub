import { pool } from "./pool.js";

/** /listo: ¿Postgres responde? Con tope de tiempo. NO reinicia por lentitud. */
export async function baseViva(topeMs = 2000): Promise<boolean> {
  try {
    const p = pool();
    const q = p.query("select 1");
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), topeMs));
    await Promise.race([q, timeout]);
    return true;
  } catch { return false; }
}
