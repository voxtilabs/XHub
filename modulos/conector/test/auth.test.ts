import { test, expect } from "vitest";
import { AutenticadorXContact, msExpira } from "../src/auth.js";

// fetch de auth falso: cuenta cada login real y entrega los tokens en orden.
function fakeAuth(cont: { n: number }, tokens: string[]) {
  let i = 0;
  return (async () => {
    cont.n++;
    const token = tokens[i++] ?? `T${i}`;
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: token, expiresIn: "1h", refresh_token: "R" }) } as Response;
  }) as unknown as typeof fetch;
}

test("msExpira entiende 1h, 30m, segundos y número", () => {
  expect(msExpira("1h")).toBe(3_600_000);
  expect(msExpira("30m")).toBe(1_800_000);
  expect(msExpira("45")).toBe(45_000);
  expect(msExpira(3600)).toBe(3_600_000);
});

test("#48: 10 peticiones concurrentes sin token → UNA sola renovación (single-flight)", async () => {
  const cont = { n: 0 };
  const auth = new AutenticadorXContact({ authUrl: "https://x:8011/api/v5/auth/supervisor", usuario: "u", clave: "c", fetchImpl: fakeAuth(cont, ["TOK"]), ahora: () => 1000 });
  const tokens = await Promise.all(Array.from({ length: 10 }, () => auth.token()));
  expect([...new Set(tokens)]).toEqual(["TOK"]);
  expect(cont.n).toBe(1); // una renovación, no diez
});

test("#48: token vencido a la mitad → renueva y termina bien", async () => {
  const cont = { n: 0 };
  let t = 1000;
  const auth = new AutenticadorXContact({ authUrl: "u", usuario: "u", clave: "c", fetchImpl: fakeAuth(cont, ["T1", "T2"]), ahora: () => t, margenMs: 0 });
  expect(await auth.token()).toBe("T1");
  expect(cont.n).toBe(1);
  t += 3_600_001; // pasa más de 1 h: el token venció
  expect(await auth.token()).toBe("T2");
  expect(cont.n).toBe(2);
});

test("#48: un 401 dispara UNA renovación coalescida entre peticiones en vuelo, y reintenta", async () => {
  const cont = { n: 0 };
  const auth = new AutenticadorXContact({ authUrl: "u", usuario: "u", clave: "c", fetchImpl: fakeAuth(cont, ["T1", "T2"]), ahora: () => 1000 });
  await auth.token(); // T1, cont=1
  // dos peticiones en vuelo con el token viejo (T1) reciben 401 y renuevan a la vez
  const hacer = (token: string) => Promise.resolve({ status: token === "T1" ? 401 : 200, token });
  const [r1, r2] = await Promise.all([auth.conBearer(hacer), auth.conBearer(hacer)]);
  expect(r1.status).toBe(200);
  expect(r2.status).toBe(200);
  expect(r1.token).toBe("T2");
  expect(cont.n).toBe(2); // T1 inicial + UNA renovación (no dos)
});
