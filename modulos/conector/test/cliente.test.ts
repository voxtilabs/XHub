import { test, expect } from "vitest";
import { ClienteXContact, ErrorProveedor } from "../src/cliente.js";

// fetch falso: recibe una cola de respuestas [status, cuerpo] por orden de llamada.
function fakeFetch(guion: Array<[number, unknown]>) {
  const llamadas: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push(`${init?.method ?? "GET"} ${url.split("/api/")[1]}`);
    const [status, cuerpo] = guion.shift() ?? [500, {}];
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(cuerpo) } as Response;
  }) as unknown as typeof fetch;
  return { f, llamadas };
}
const base = { baseUrl: "https://x:8004", usuario: "u", clave: "c", dormir: async () => {}, ahora: () => 1_000 };

test("autentica y manda Authorization: Bearer en la llamada de datos", async () => {
  const { f, llamadas } = fakeFetch([[200, { token: "TOK-123" }], [200, { dados: [], total: 0 }]]);
  const authHeaders: (string | undefined)[] = [];
  const f2 = (async (url: string, init?: RequestInit) => {
    authHeaders.push((init?.headers as Record<string, string>)?.authorization);
    return f(url, init);
  }) as unknown as typeof fetch;
  const cli = new ClienteXContact({ ...base, fetchImpl: f2 });
  const pag = await cli.listarLlamadas("2026-09-01", "2026-09-02");
  expect(pag.total).toBe(0);
  expect(llamadas[0]).toContain("login/supervisor");
  expect(authHeaders[1]).toBe("Bearer TOK-123");  // la 2ª llamada (datos) lleva el bearer
});

test("reintenta un 500 transitorio y a la 2ª responde", async () => {
  const { f, llamadas } = fakeFetch([[200, { token: "T" }], [500, { e: 1 }], [200, { dados: [], total: 0 }]]);
  const cli = new ClienteXContact({ ...base, fetchImpl: f });
  const pag = await cli.listarLlamadas("2026-09-01", "2026-09-02");
  expect(pag.total).toBe(0);
  expect(llamadas.filter((l) => l.includes("ligacoes")).length).toBe(2);  // reintentó una vez
});

test("un 401 re-autentica UNA vez y reintenta", async () => {
  const { f, llamadas } = fakeFetch([[200, { token: "T1" }], [401, {}], [200, { token: "T2" }], [200, { dados: [], total: 0 }]]);
  const cli = new ClienteXContact({ ...base, fetchImpl: f });
  await cli.listarLlamadas("2026-09-01", "2026-09-02");
  expect(llamadas.filter((l) => l.includes("login")).length).toBe(2);  // dos logins: inicial + re-auth
});

test("un 403 (permiso) NO se reintenta — falla de inmediato", async () => {
  const { f, llamadas } = fakeFetch([[200, { token: "T" }], [403, { msg: "sin scope" }]]);
  const cli = new ClienteXContact({ ...base, fetchImpl: f });
  await expect(cli.listarLlamadas("2026-09-01", "2026-09-02")).rejects.toBeInstanceOf(ErrorProveedor);
  expect(llamadas.filter((l) => l.includes("ligacoes")).length).toBe(1);  // una sola, sin reintentos
});

test("el cortacircuitos abre tras fallos sostenidos y deja de golpear", async () => {
  // login ok, luego siempre 500 (transitorio, reintentable). maxReintentos 0 = 1 intento por llamada.
  const guion: Array<[number, unknown]> = [[200, { token: "T" }]];
  for (let i = 0; i < 20; i++) guion.push([500, {}]);
  const { f, llamadas } = fakeFetch(guion);
  const cli = new ClienteXContact({ ...base, fetchImpl: f, maxReintentos: 0 });
  for (let i = 0; i < 5; i++) await cli.listarLlamadas("2026-09-01", "2026-09-02").catch(() => {});
  expect(cli.estadoCorte).toBe("abierto");
  const antes = llamadas.length;
  await expect(cli.listarLlamadas("2026-09-01", "2026-09-02")).rejects.toThrow(/[Cc]ortacircuitos/);
  expect(llamadas.length).toBe(antes);  // no volvió a golpear la API
});
