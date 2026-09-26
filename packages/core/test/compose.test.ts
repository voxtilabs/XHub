import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const compose = readFileSync(join(__dirname, "..", "..", "..", "docker-compose.yml"), "utf8");

test("ningún servicio publica puertos del host (todo por el proxy inverso)", () => {
  // no debe haber una clave 'ports:' — el tráfico entra por el reverse proxy
  expect(compose).not.toMatch(/^\s*ports:/m);
});

test("Postgres y Redis persisten en volúmenes", () => {
  expect(compose).toContain("pgdata:/var/lib/postgresql/data");
  expect(compose).toContain("redisdata:/data");
});

test("la contraseña de Postgres es obligatoria (no arranca sin ella)", () => {
  expect(compose).toMatch(/POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/);
});

test("la app apunta a la base por el host interno, no por localhost", () => {
  expect(compose).toContain("@postgres:5432/");
  expect(compose).not.toContain("@localhost:5432/");
});

test("los dominios van por variable de entorno, no horneados", () => {
  expect(compose).toContain("XHUB_DOMINIO_API");
  const env = readFileSync(join(__dirname, "..", "..", "..", ".env.example"), "utf8");
  expect(env).toMatch(/XHUB_DOMINIO_PANEL=/);
  expect(env).toMatch(/XHUB_CORS_ORIGENES=/);
});

test(".env.example no trae Sentry (pospuesto, lo paga X5)", () => {
  const env = readFileSync(join(__dirname, "..", "..", "..", ".env.example"), "utf8");
  expect(env).not.toMatch(/^SENTRY_DSN=/m);
});
