// Story 1.4 (_bmad-output/implementation-artifacts/
// spec-1-4-app-token-issuance-and-validation.md): confirms a real signIn()
// call (src/app/actions/auth.ts), run UNMODIFIED against a real, local
// `supabase start` instance, sets both the existing Supabase session
// cookie and the new `brujula_app_token` cookie on success, and neither
// on failure.
//
// What's real: signIn() itself, its `supabase.auth.signInWithPassword`
// call against the local instance, @/lib/supabase/server's createClient
// (unmocked -- it builds a real @supabase/ssr server client), and
// signAppToken/requireApiToken (src/server/shared/auth.ts, also unmocked).
//
// What's mocked, and why: only the two bits of Next.js plumbing that need
// a live request (`redirect`) and a request-scoped cookie store
// (`next/headers`'s `cookies()`) -- a plain Vitest run has neither. The
// mocked cookie store is a simple in-memory jar so this test can inspect,
// after calling signIn(), exactly which cookies got set and with what
// options -- the same technique tests/characterization/report-groups.test.ts
// uses for `redirect()`.

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_TOKEN_COOKIE, requireApiToken } from "@/server/shared/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Same fixed password every scripts/seed-*.mjs script uses for every
// account it creates (see scripts/seed-demo-company.mjs).
const PASSWORD = "kairos123";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary from the spec: never run this suite against a remote
// Supabase project, dev or production -- only the local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}
if (!process.env.APP_TOKEN_SECRET) {
  throw new Error(
    "Falta APP_TOKEN_SECRET -- debe venir de .env.test.local (spec-1-4-app-token-issuance-and-validation.md)."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why.
// ---------------------------------------------------------------------------

type CookieOptions = Record<string, unknown> | undefined;
type CookieEntry = { value: string; options: CookieOptions };

const cookieState = vi.hoisted(() => ({
  jar: new Map<string, CookieEntry>(),
}));

function resetCookieJar() {
  cookieState.jar.clear();
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`test redirect marker: ${url}`) as Error & { redirectUrl: string };
    err.redirectUrl = url;
    throw err;
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () =>
      Array.from(cookieState.jar.entries()).map(([name, { value }]) => ({ name, value })),
    get: (name: string) => {
      const entry = cookieState.jar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    has: (name: string) => cookieState.jar.has(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieState.jar.set(name, { value, options });
    },
    delete: (name: string) => {
      cookieState.jar.delete(name);
    },
  }),
}));

// Imported after the mocks above (vi.mock calls are hoisted to the top of
// the module regardless of source order) so importing this, the
// unmodified action module, picks up the mocked `next/navigation` and
// `next/headers` while still using the REAL @/lib/supabase/server and
// @/server/shared/auth.
import { signIn } from "@/app/actions/auth";

/** Calls a mocked Server Action and returns the URL it "redirected" to. */
async function getRedirectUrl(action: () => Promise<void>): Promise<string> {
  try {
    await action();
  } catch (e) {
    const url = (e as { redirectUrl?: string }).redirectUrl;
    if (url) return url;
    throw e;
  }
  throw new Error("expected the Server Action to redirect, but it returned normally");
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company. This suite only needs a real,
// confirmed, logged-in-capable account (the supervisor), not the
// report-groups domain data the characterization suite for that domain
// seeds -- but seed-demo-company.mjs's cycle step (organize_cycle_evaluators)
// requires each employee to have 5 *other* employees as evaluators (never
// the Supervisor, per 0032_supervisor_cannot_be_evaluator.sql), so the
// employee count can't go below 6.
// ---------------------------------------------------------------------------

let supervisorEmail: string;

beforeAll(async () => {
  const companyName = `Char Test Auth ${Date.now()}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "6"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      },
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `seed-demo-company.mjs failed: ${err.message}\n--- stdout ---\n${err.stdout}\n--- stderr ---\n${err.stderr}`
    );
  }

  const supervisorMatch = seedOutput.match(/^Supervisor: (\S+) \//m);
  if (!supervisorMatch) {
    throw new Error(`no se pudo extraer el email del Supervisor de la salida del seed:\n${seedOutput}`);
  }
  supervisorEmail = supervisorMatch[1];
});

beforeEach(() => {
  resetCookieJar();
});

afterAll(() => {
  resetCookieJar();
});

function formDataFor(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

function nonAppTokenCookies(): [string, CookieEntry][] {
  return Array.from(cookieState.jar.entries()).filter(([name]) => name !== APP_TOKEN_COOKIE);
}

describe("signIn", () => {
  test("valid credentials -> sets both the Supabase session cookie(s) and brujula_app_token", async () => {
    const url = await getRedirectUrl(() => signIn(formDataFor(supervisorEmail, PASSWORD)));
    expect(url).toBe("/dashboard");

    // The existing Supabase session cookie(s) -- set via @supabase/ssr's
    // own setAll callback in @/lib/supabase/server, unmodified by this
    // story. Asserting "at least one non-app-token cookie exists" rather
    // than a specific name keeps this from being coupled to @supabase/ssr's
    // internal cookie-naming/chunking scheme.
    expect(nonAppTokenCookies().length).toBeGreaterThan(0);

    // The new app token cookie, with the exact options the spec requires.
    const appTokenEntry = cookieState.jar.get(APP_TOKEN_COOKIE);
    expect(appTokenEntry).toBeDefined();
    expect(appTokenEntry!.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    // The token itself is valid per requireApiToken -- a non-mutating
    // request carrying it resolves ok.
    const request = new Request("https://example.test/api/report-groups", {
      method: "GET",
      headers: { cookie: `${APP_TOKEN_COOKIE}=${appTokenEntry!.value}` },
    });
    expect(requireApiToken(request)).toEqual({ ok: true });
  });

  test("invalid credentials -> existing redirect-with-error behavior only, no app token issued", async () => {
    const url = await getRedirectUrl(() =>
      signIn(formDataFor(supervisorEmail, "definitely-the-wrong-password"))
    );

    expect(url.startsWith("/login?error=")).toBe(true);
    expect(cookieState.jar.has(APP_TOKEN_COOKIE)).toBe(false);
  });
});
