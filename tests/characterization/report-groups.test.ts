// Story 1.1 (_bmad-output/implementation-artifacts/
// spec-1-1-characterization-tests-report-groups-baseline.md): characterization
// tests for src/app/actions/reportGroups.ts, run UNMODIFIED against a real,
// local `supabase start` instance. This is the baseline every later Epic 1
// story (1.2, 1.6, 1.8) re-verifies against as report groups move behind the
// new db/manager/API layering.
//
// What's real: the Server Actions themselves (createReportGroup,
// respondToReportGroup, closeReportGroup), every Postgres RPC they call
// (create_report_group, respond_to_report_group, close_report_group,
// get_report_group, get_report_group_competency_summary,
// save_report_group_interpretation), and generateReportGroupInterpretation
// in src/lib/aiInterpretation.ts (including its own real RPC calls and,
// best-effort, a real Anthropic call if ANTHROPIC_API_KEY happens to be set
// for this process).
//
// What's mocked, and why: only the two bits of Next.js plumbing that need
// a live request (`redirect`, `revalidatePath`) and the cookie-based
// Supabase client factory (`@/lib/supabase/server`, which needs
// `next/headers` -- also request-scoped). None of that is "business logic"
// under test here; it's the framework glue a real HTTP request provides in
// production but a plain Vitest run does not. `redirect()` is mocked to
// throw a small marker error carrying the target URL instead of Next's real
// `NEXT_REDIRECT` signal, which is what lets a plain `await action(formData)`
// call observe "where would this have redirected to" without a live
// request/response cycle.

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
// scripts/seed-report-group.mjs: this story's other deliverable -- the
// reusable per-domain seed-group helper, exercised here for real to build
// the "close below threshold" fixture (see acceptance criterion 5: later
// Epic 3 domains reuse this shape).
import { seedReportGroup } from "../../scripts/seed-report-group.mjs";

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
// Mocks -- see file header for what and why.
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null }));

function actingAs(token: string) {
  acting.token = token;
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`test redirect marker: ${url}`) as Error & { redirectUrl: string };
    err.redirectUrl = url;
    throw err;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.token) {
      throw new Error("test bug: actingAs(token) must be called before invoking a Server Action");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${acting.token}` } },
    });
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order) so that importing this,
// the unmodified action module, picks up the mocked `next/navigation`,
// `next/cache` and `@/lib/supabase/server`.
import { createReportGroup, respondToReportGroup, closeReportGroup } from "@/app/actions/reportGroups";

// ---------------------------------------------------------------------------
// Small REST/RPC helpers -- same anon-key-only pattern as scripts/seed-*.mjs.
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

const GROUP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company per test run (unique name, so reruns
// never collide with previous ones -- same constraint scripts/seed-demo-company.mjs
// itself documents). 18 employees so the "cerrado" (closed-360) bucket --
// every 3rd employee -- has exactly 6 people: enough for one group that
// reaches the 5-accepted close threshold with one deliberate decline left
// over, while scripts/seed-report-group.mjs's own fixture group (below
// threshold) reuses the same pool on a second, independent group.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
let eligibleEmployees: SeededEmployee[];
let eligibleTokens: string[];
let eligibleIds: string[];
let ineligibleId: string;

beforeAll(async () => {
  const companyName = `Char Test RG ${Date.now()}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "18"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Pin the subprocess to the exact URL/key this file already verified
      // is local-only (see the guard above) -- seed-demo-company.mjs's own
      // loadEnvLocal() would otherwise re-read .env.local independently,
      // which could silently diverge from .env.test.local and defeat that
      // guard.
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

  const employees: SeededEmployee[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employees.push({ email: m[1], bucketLabel: m[2] });
  }

  eligibleEmployees = employees.filter((e) => e.bucketLabel === "cerrado");
  const ineligiblePool = employees.filter((e) => e.bucketLabel !== "cerrado");
  if (eligibleEmployees.length < 6 || ineligiblePool.length === 0) {
    throw new Error(
      "seed-demo-company.mjs no produjo suficientes empleados elegibles/inelegibles " +
        `(elegibles=${eligibleEmployees.length}, inelegibles=${ineligiblePool.length}). Salida completa:\n${seedOutput}`
    );
  }
  const ineligibleEmployee = ineligiblePool[0];

  supervisorToken = await login(supervisorEmail, PASSWORD);
  eligibleTokens = await Promise.all(eligibleEmployees.map((e) => login(e.email, PASSWORD)));

  const allEmails = [...eligibleEmployees.map((e) => e.email), ineligibleEmployee.email];
  const rows = (await restGet(
    `members?select=id,email&email=in.(${allEmails.join(",")})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(rows.map((r) => [r.email, r.id]));
  eligibleIds = eligibleEmployees.map((e) => idByEmail[e.email]);
  ineligibleId = idByEmail[ineligibleEmployee.email];
  if (eligibleIds.some((id) => !id) || !ineligibleId) {
    throw new Error("no se pudieron resolver todos los member ids de los empleados sembrados");
  }
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// createReportGroup
// ---------------------------------------------------------------------------

describe("createReportGroup", () => {
  let groupA: string;

  test("eligible members -> creates the group, redirects to /dashboard/groups/{id}", async () => {
    const fd = new FormData();
    fd.set("name", `Grupo elegible ${Date.now()}`);
    for (const id of eligibleIds) fd.append("memberId", id);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createReportGroup(fd));

    expect(url).toMatch(/^\/dashboard\/groups\//);
    groupA = url.replace("/dashboard/groups/", "");
    expect(groupA).toMatch(GROUP_ID_RE);
  });

  test("ineligible member (no closed 360) -> create_report_group raises, redirects to nuevo?error=", async () => {
    const fd = new FormData();
    fd.set("name", `Grupo inelegible ${Date.now()}`);
    fd.append("memberId", ineligibleId);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createReportGroup(fd));

    expect(url.startsWith("/dashboard/groups/nuevo?error=")).toBe(true);
    const message = decodeURIComponent(url.slice(url.indexOf("error=") + "error=".length));
    // Recorded verbatim from create_report_group's raised exception
    // (supabase/migrations/0064_report_groups.sql) -- this is the baseline,
    // not an assumed string.
    expect(message).toBe(
      "Todos los invitados deben ser compañeros activos de tu empresa con al menos un 360 ya finalizado."
    );
  });

  // --------------------------------------------------------------------
  // respondToReportGroup + closeReportGroup, at/above threshold: reuses
  // groupA so the "accept" path is exercised against a group that reaches
  // the 5-accepted minimum, with one deliberate decline left over to
  // characterize that path too.
  // --------------------------------------------------------------------

  describe("respondToReportGroup / closeReportGroup on that same group (at/above threshold)", () => {
    test("accept x5 -> membership accepted, redirects back to the group", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      for (let i = 0; i < 5; i++) {
        const fd = new FormData();
        fd.set("groupId", groupA);
        fd.set("accept", "true");
        actingAs(eligibleTokens[i]);
        const url = await getRedirectUrl(() => respondToReportGroup(fd));
        expect(url).toBe(`/dashboard/groups/${groupA}`);
      }
    });

    test("decline (6th invitee) -> membership rejected, redirects back to the group", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      const fd = new FormData();
      fd.set("groupId", groupA);
      fd.set("accept", "false");
      actingAs(eligibleTokens[5]);
      const url = await getRedirectUrl(() => respondToReportGroup(fd));
      expect(url).toBe(`/dashboard/groups/${groupA}`);
    });

    test("membership state after responses: 5 accepted, 1 rejected", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      const detail = (await callRpc("get_report_group", supervisorToken, { p_group_id: groupA })) as {
        members: { member_id: string; status: string }[];
      };
      const statuses = detail.members.map((m) => m.status).sort();
      expect(statuses).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted", "rejected"]);
    });

    test("close at/above threshold -> group closes; AI interpretation is text or null, never throws", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      const fd = new FormData();
      fd.set("groupId", groupA);
      actingAs(eligibleTokens[0]); // one of the accepted members, not the creator
      const url = await getRedirectUrl(() => closeReportGroup(fd));
      expect(url).toBe(`/dashboard/groups/${groupA}`);

      const detail = (await callRpc("get_report_group", eligibleTokens[0], { p_group_id: groupA })) as {
        status: string;
        ai_interpretation: string | null;
      };
      expect(detail.status).toBe("closed");

      // Baseline per spec: both outcomes are valid depending on whether
      // ANTHROPIC_API_KEY happens to be set for this process -- never a
      // single hardcoded expectation.
      expect(detail.ai_interpretation === null || typeof detail.ai_interpretation === "string").toBe(true);
      if (typeof detail.ai_interpretation === "string") {
        expect(detail.ai_interpretation.length).toBeGreaterThan(0);
      }
      console.log(
        `[characterization] AI interpretation outcome for groupA: ${
          detail.ai_interpretation === null ? "null (no ANTHROPIC_API_KEY or empty summary)" : "text generated"
        }`
      );
    });
  });
});

// ---------------------------------------------------------------------------
// closeReportGroup: below threshold, via scripts/seed-report-group.mjs.
// A second, independent group built with this story's other deliverable --
// reused here so its shape (anon-key REST, no service role, importable) is
// actually exercised, not just written and left unused.
// ---------------------------------------------------------------------------

describe("closeReportGroup: below the accepted-member threshold", () => {
  test("< min_invitees_per_request accepted -> close_report_group raises 'Hacen falta...' baseline", async () => {
    const threeEmails = eligibleEmployees.slice(0, 3).map((e) => e.email);
    const threeTokens = eligibleTokens.slice(0, 3);

    const { groupId } = await seedReportGroup({
      supabaseUrl: SUPABASE_URL,
      apikey: ANON_KEY,
      creatorEmail: supervisorEmail,
      creatorPassword: PASSWORD,
      name: `Grupo bajo umbral ${Date.now()}`,
      memberEmails: threeEmails,
    });
    expect(groupId).toMatch(GROUP_ID_RE);

    // Only 2 of 3 accept -- below the default minimum of 5.
    for (let i = 0; i < 2; i++) {
      const fd = new FormData();
      fd.set("groupId", groupId);
      fd.set("accept", "true");
      actingAs(threeTokens[i]);
      await getRedirectUrl(() => respondToReportGroup(fd));
    }

    const fd = new FormData();
    fd.set("groupId", groupId);
    actingAs(threeTokens[0]);
    const url = await getRedirectUrl(() => closeReportGroup(fd));

    expect(url.startsWith(`/dashboard/groups/${groupId}?error=`)).toBe(true);
    const message = decodeURIComponent(url.slice(url.indexOf("error=") + "error=".length));
    // Recorded verbatim from close_report_group's raised exception
    // (supabase/migrations/0064_report_groups.sql): "Hacen falta al menos
    // % personas aceptadas para cerrar el grupo." with min_invitees_per_request
    // (5, no per-org override seeded by seed-demo-company.mjs) substituted in.
    expect(message).toBe("Hacen falta al menos 5 personas aceptadas para cerrar el grupo.");
  });
});
