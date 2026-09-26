import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "vitest";

// Ley de la casa: ningún color hex vive fuera de tokens.css.
// Todo color sale de un token var(--...). Ver docs/diseno/SISTEMA.md.
function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.(ts|tsx|css)$/.test(e) && !p.endsWith("tokens.css")) out.push(p);
  }
  return out;
}

test("no hay hex sueltos fuera de tokens.css", () => {
  const raiz = join(__dirname, "..", "src");
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  const culpables: string[] = [];
  for (const f of archivos(raiz)) {
    const t = readFileSync(f, "utf8");
    if (hex.test(t)) culpables.push(f);
  }
  expect(culpables, `hex fuera de tokens.css: ${culpables.join(", ")}`).toEqual([]);
});
