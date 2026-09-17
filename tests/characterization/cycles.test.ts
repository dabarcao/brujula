// Story 3.7 (_bmad-output/implementation-artifacts/
// spec-3-7-characterization-tests-cycles-baseline.md) originally
// characterized all 6 src/app/actions/cycles.ts Server Actions plus the
// direct-RPC read paths they feed (get_cycle_status,
// get_request_competency_comparison, get_colleagues_with_closed_cycle),
// against a real, local `supabase start` instance, as the baseline Epic
// 3's cycles domain migration (3.8-3.12) re-verified against.
//
// Story 5.1a (spec-5-1a-delete-old-path-cycles.md) deleted cycles.ts's old
// direct-Supabase path and its feature flag entirely, making this file's
// old-path-specific Server Action assertions meaningless (Story 3.7's own
// baseline is now superseded by tests/integration/cycles-new-path-verification.test.ts,
// which exercises the same 6 actions against the single remaining path).
// What's left here is the 3 direct-RPC read scenarios below
// (get_cycle_status, get_request_competency_comparison,
// get_colleagues_with_closed_cycle) -- none of them are flag-gated, so they
// remain valid, standalone characterization of behavior nothing else in
// this repo re-asserts.
//
// What's real: every Postgres RPC called below, against the local
// `supabase start` instance -- called directly the same way
// src/app/dashboard/cycles/[id]/estado/page.tsx,
// src/app/dashboard/feedback/[id]/page.tsx, and
// src/app/dashboard/groups/nuevo/page.tsx call them (no Server Action
// wraps any of them, so no Next.js/Supabase-client mocking is needed in
// this file at all).
//
// Fixture: one fresh demo company per test run via scripts/seed-demo-company.mjs
// (same execFileSync + stdout-regex-parsing technique report-groups.test.ts
// already established), which gives us the closed-cycle infrastructure the
// 3 retained read scenarios need (a closed request, a still-open one, and a
// supervisor-only-readable cycle).

import { beforeAll, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and tests/characterization/report-groups.test.ts.
// ---------------------------------------------------------------------------

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function restGet(pathAndQuery: string, token: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GET ${pathAndQuery} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function callRpc(name: string, token: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${name} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (6
// employees -- 2 per realism bucket). Only the "cerrado" and "listo (sin
// cerrar)" buckets are needed by the 3 retained read scenarios below (a
// closed request to read, and a distinct non-requester/non-supervisor
// account to exercise each RPC's access-control rejection).
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
let seedCycleId: string;
let closedEmployee: { token: string; id: string; requestId: string };
let readyEmployee: { token: string; id: string; requestId: string };

const runId = Date.now();

beforeAll(async () => {
  const companyName = `Char Test Cycles ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "6"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Pin the subprocess to the exact URL/key this file already verified
      // is local-only -- seed-demo-company.mjs's own loadEnvLocal() would
      // otherwise re-read .env.local independently.
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

  const cycleIdMatch = seedOutput.match(/^ {3}cycle id: (\S+)$/m);
  if (!cycleIdMatch) {
    throw new Error(`no se pudo extraer el cycle id de la salida del seed:\n${seedOutput}`);
  }
  seedCycleId = cycleIdMatch[1];

  const employees: SeededEmployee[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employees.push({ email: m[1], bucketLabel: m[2] });
  }

  const closed = employees.find((e) => e.bucketLabel === "cerrado");
  const ready = employees.find((e) => e.bucketLabel === "listo (sin cerrar)");
  if (!closed || !ready) {
    throw new Error(
      `seed-demo-company.mjs no produjo los buckets esperados. Salida completa:\n${seedOutput}`
    );
  }

  supervisorToken = await login(supervisorEmail, PASSWORD);

  const memberRows = (await restGet(
    `members?select=id,email&email=in.(${employees.map((e) => e.email).join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));

  async function resolve(e: SeededEmployee) {
    const token = await login(e.email, PASSWORD);
    const id = idByEmail[e.email];
    const requests = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${id}&request_type=eq.cycle`,
      token
    )) as { id: string }[];
    return { token, id, requestId: requests[0].id };
  }

  closedEmployee = await resolve(closed);
  readyEmployee = await resolve(ready);
});

// ---------------------------------------------------------------------------
// get_cycle_status / get_request_competency_comparison -- called directly,
// the same way src/app/dashboard/cycles/[id]/estado/page.tsx and
// src/app/dashboard/feedback/[id]/page.tsx call them (no Server Action
// wraps either).
// ---------------------------------------------------------------------------

describe("get_cycle_status", () => {
  test("closed cycle -> returns rows with status: 'completado' for participants who finished", async () => {
    const rows = (await callRpc("get_cycle_status", supervisorToken, {
      p_cycle_id: seedCycleId,
    })) as { member_id: string; full_name: string | null; email: string; status: string }[];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.status === "completado")).toBe(true);
    // closedEmployee's request was already closed by scripts/seed-demo-company.mjs
    // itself (its "cerrado" bucket) -- it must show up as "completado" here.
    const closedRow = rows.find((r) => r.member_id === closedEmployee.id);
    expect(closedRow).toBeDefined();
    expect(closedRow!.status).toBe("completado");
  });

  test("as a non-supervisor, rejects with its exact access-control message", async () => {
    await expect(
      callRpc("get_cycle_status", readyEmployee.token, { p_cycle_id: seedCycleId })
    ).rejects.toThrow(
      // Recorded verbatim from get_cycle_status's raised exception
      // (supabase/migrations/0035_cycle_status_for_supervisor.sql:28).
      "Solo el administrador de la empresa puede ver el estado de un ciclo."
    );
  });
});

describe("get_request_competency_comparison", () => {
  test("closed request -> returns the comparison shape the report page consumes", async () => {
    const rows = (await callRpc("get_request_competency_comparison", closedEmployee.token, {
      p_request_id: closedEmployee.requestId,
    })) as {
      competency_code: string;
      competency_name: string;
      principle_code: string | null;
      principle_name: string | null;
      role_code: string | null;
      role_name: string | null;
      self_value: number | null;
      peer_avg_value: number | null;
      peer_response_count: number;
    }[];

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row).toHaveProperty("competency_code");
    expect(row).toHaveProperty("competency_name");
    expect(row).toHaveProperty("self_value");
    expect(row).toHaveProperty("peer_avg_value");
    expect(row).toHaveProperty("peer_response_count");
    // Added by supabase/migrations/0054_expose_role_in_competency_reports.sql
    // -- already returned by this same RPC call, just not previously
    // asserted here.
    expect(row).toHaveProperty("principle_code");
    expect(row).toHaveProperty("principle_name");
    expect(row).toHaveProperty("role_code");
    expect(row).toHaveProperty("role_name");
  });

  test("as a non-requester, rejects with its exact access-control message", async () => {
    // readyEmployee is a different account from closedEmployee (the
    // request's own requester/evaluatee) -- even though readyEmployee may
    // also be one of the request's invited evaluators, the RPC only ever
    // allows the requester itself.
    await expect(
      callRpc("get_request_competency_comparison", readyEmployee.token, {
        p_request_id: closedEmployee.requestId,
      })
    ).rejects.toThrow(
      // Recorded verbatim from get_request_competency_comparison's raised
      // exception (supabase/migrations/0054_expose_role_in_competency_reports.sql:179).
      "No tienes acceso a esta solicitud."
    );
  });
});

// ---------------------------------------------------------------------------
// get_colleagues_with_closed_cycle -- called directly, the same way
// src/app/dashboard/groups/nuevo/page.tsx calls it (no Server Action wraps
// it; it takes no parameters).
// ---------------------------------------------------------------------------

describe("get_colleagues_with_closed_cycle", () => {
  test("returns colleagues in the same company who have a closed 360, excluding the caller", async () => {
    const rows = (await callRpc("get_colleagues_with_closed_cycle", readyEmployee.token, {})) as {
      id: string;
      email: string;
      full_name: string | null;
    }[];

    // closedEmployee's request was already closed by
    // scripts/seed-demo-company.mjs itself (its "cerrado" bucket) -- it
    // must show up here.
    expect(rows.some((r) => r.id === closedEmployee.id)).toBe(true);
    // readyEmployee's own request isn't closed, and the RPC excludes the
    // caller regardless.
    expect(rows.some((r) => r.id === readyEmployee.id)).toBe(false);
  });
});
