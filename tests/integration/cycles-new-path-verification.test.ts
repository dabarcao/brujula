// Story 3.12 (_bmad-output/implementation-artifacts/
// spec-3-12-cycles-new-path-verification.md) established this suite as the
// explicit gating condition before the (now-removed) cycles feature flag
// was ever flipped for real. Story 5.1a
// (spec-5-1a-delete-old-path-cycles.md) deleted the old direct-Supabase
// path and its flag entirely, so these Server Actions run unconditionally
// now -- this file keeps running the same scenarios, minus the flag setup,
// as its ongoing business-logic verification. Two sections, both real
// (local Supabase, no manager/RPC mocking), plus one in-process-vs-HTTP
// equivalence test:
//
// (1) re-runs Story 3.7's characterized scenarios
// (tests/characterization/cycles.test.ts) against the Server Actions, for
// all 6 cycles.ts functions plus both direct-RPC read scenarios
// (get_cycle_status, get_colleagues_with_closed_cycle), asserting the exact
// same redirect URLs/error messages that baseline already documents. Also
// re-runs the get_request_competency_comparison scenario end-to-end against
// a request closed here, confirming report-reading integrity even though
// that RPC itself was never flag-gated (it's excluded to db/feedback.ts,
// Story 3.14, per Story 3.8's own investigated correction).
//
// (2) a static source-inspection check proving db/cycles.ts -- where every
// real `.rpc()` call cyclesManager.ts delegates to actually lives -- never
// references any ad-hoc-feedback RPC name, satisfying AC2's boundary check
// (AD-3's cycles-vs-ad-hoc write-ownership split) without depending on
// feedbackManager existing yet (Story 3.18 does the reverse, symmetric
// check).
//
// (3) one in-process-vs-HTTP equivalence test (mirroring Story 3.6's own
// technique for createOrganizationAsAdmin): the same "participant already
// has an open cycle" rejection, reached once via the
// createFeedbackCycle Server Action (in-process) and once via
// POST /api/cycles (HTTP), asserting both surfaces reject with the exact
// same message. A rejection (not a success path) was chosen deliberately:
// unlike admin org creation, a *successful* createFeedbackCycle call
// permanently consumes its participant's "no open cycle" eligibility, so a
// second successful call for the same participant is not repeatable inside
// this file without inviting brand-new org members purely as plumbing --
// out of proportion to a check the spec itself says isn't literally
// required by epics.md's AC text. The rejection path is idempotent (no
// state mutation), so the same seeded participant can be reused for both
// calls and is a genuine, low-cost equivalence proof.
//
// What's real: the Server Actions, the Route Handler, cyclesManager,
// db/cycles.ts, and every Postgres RPC underneath, run against the local
// `supabase start` instance. What's mocked, and why: only the bits of
// Next.js plumbing that need a live request (`redirect`, `revalidatePath`)
// and the cookie-based Supabase client factory (`@/lib/supabase/server`) --
// exactly Story 3.7's own mocks (none of cycles.ts's 6 actions touch
// cookies, so unlike Story 3.6's admin/members/auth suite, next/headers
// does not need mocking here).

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { APP_TOKEN_COOKIE, CSRF_HEADER, signAppToken } from "@/server/shared/auth";

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
// Hard boundary carried over from every prior characterization/integration
// suite in this repo: never run this against a remote Supabase project, dev
// or production -- only the local CLI instance.
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
// Mocks -- identical to tests/characterization/cycles.test.ts (Story 3.7),
// see file header for what and why.
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
// the top of the module regardless of source order) so that importing
// these, the unmodified Story 3.10 file and Story 3.9 route, picks up the
// mocked `next/navigation`, `next/cache` and `@/lib/supabase/server`.
import {
  createFeedbackCycle,
  finalizeCycleRequest,
  organizeCycleEvaluators,
  createIndividualCycleRequest,
  updateCycleRequestEvaluators,
  updateIndividualCycleRequestEvaluators,
} from "@/app/actions/cycles";
import { POST as createCycleRoute } from "@/app/api/cycles/route";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and Stories 3.7/3.8/3.9's suites.
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

async function signUp(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`signUp failed for ${email}: ${JSON.stringify(data)}`);
  }
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

function errorFromRedirect(url: string, prefix: string): string {
  expect(url.startsWith(prefix)).toBe(true);
  return decodeURIComponent(url.slice(url.indexOf("error=") + "error=".length));
}

/** Fresh individual-kind account (organizations.kind = 'individual'), via
 * create_individual_account -- the only way to reach createIndividualCycleRequest/
 * updateIndividualCycleRequestEvaluators's success path, same helper as
 * Story 3.7's suite. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

/** Builds a constructed `Request` carrying (optionally) the app-token cookie
 * and/or the anti-CSRF header, per Story 1.4's requireApiToken() contract --
 * same helper tests/integration/cycles-route.test.ts uses, needed only for
 * Section 3's HTTP-side call. */
function appRequest(
  url: string,
  init: { method?: string; token?: string | null; csrf?: boolean; body?: unknown } = {}
): Request {
  const headers = new Headers();
  if (init.token) headers.set("cookie", `${APP_TOKEN_COOKIE}=${init.token}`);
  if (init.csrf) headers.set(CSRF_HEADER, "1");
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  return new Request(url, { method: init.method ?? "GET", headers, body });
}

const EVALUATOR_CATEGORIES = ["manager", "team", "team", "organization", "other"];

function todayPlusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function evaluatorFormFields(fd: FormData, ids: string[], categories: string[]) {
  ids.forEach((id, i) => {
    fd.append("evaluatorId", id);
    fd.set(`category_${id}`, categories[i]);
  });
}

function evaluatorEmailFormFields(fd: FormData, emails: string[], categories: string[]) {
  emails.forEach((email, i) => {
    fd.append("evaluatorEmails", email);
    fd.set(`category_${email}`, categories[i]);
  });
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs, same
// technique as Stories 3.7/3.8/3.9's suites (6 employees -- 2 per realism
// bucket).
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
let supervisorMemberId: string;
let seedCycleId: string;
let closedEmployee: { token: string; id: string; requestId: string };
let readyEmployee: { token: string; id: string; requestId: string };
let halfDoneEmployee: { token: string; id: string; requestId: string };
let evaluatorPool: { id: string }[]; // >= 5 active, non-supervisor org employees
let appToken: string;

// Shared across the flat, sibling Section 1 describe blocks below
// (createFeedbackCycle / organizeCycleEvaluators / updateCycleRequestEvaluators):
// createFeedbackCycle's own tests populate these, and the two describes that
// follow it depend on them via this outer closure rather than nesting.
let freshCycleId: string;
let freshRequestId: string;

const runId = Date.now();

beforeAll(async () => {
  appToken = signAppToken("cycles-new-path-verification-user");

  const companyName = `New Path Verif Cycles ${runId}`;
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
  const halfDone = employees.find((e) => e.bucketLabel === "a medias");
  if (!closed || !ready || !halfDone) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 3 buckets esperados. Salida completa:\n${seedOutput}`
    );
  }

  supervisorToken = await login(supervisorEmail, PASSWORD);

  const memberRows = (await restGet(
    `members?select=id,email,organization_id&email=in.(${employees.map((e) => e.email).join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string; organization_id: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));
  supervisorMemberId = idByEmail[supervisorEmail];

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
  halfDoneEmployee = await resolve(halfDone);

  evaluatorPool = employees.map((e) => ({ id: idByEmail[e.email] }));
  if (evaluatorPool.length < 5) {
    throw new Error(`evaluatorPool insuficiente (${evaluatorPool.length}); se necesitan >= 5.`);
  }
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// Section 1: Story 3.7's characterized scenarios, re-run against the Server
// Actions -- every assertion below is copied
// verbatim from tests/characterization/cycles.test.ts.
// ---------------------------------------------------------------------------

describe("Section 1: createFeedbackCycle", () => {
  test("missing required field -> redirects to /dashboard/cycles/nueva?error= with the exact pre-RPC validation message", async () => {
    const fd = new FormData();
    fd.set("name", "");
    fd.set("opensAt", todayPlusDays(0));
    fd.set("closesAt", todayPlusDays(30));

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createFeedbackCycle(fd));

    const message = errorFromRedirect(url, "/dashboard/cycles/nueva?error=");
    // Recorded verbatim from createFeedbackCycle's own pre-RPC validation
    // (src/app/actions/cycles.ts) -- this never reaches the flag branch at
    // all, included anyway for full parity with Story 3.7's baseline.
    expect(message).toBe("Rellena todos los campos.");
  });

  test("as the Supervisor, valid input -> creates the cycle, redirects to /dashboard?cycleCreated=1", async () => {
    // Same rationale as Story 3.7's own suite: the Supervisor is the cycle's
    // own sole participant, sidestepping the seeded employees' existing
    // "one open cycle at a time" lock (0023_one_open_cycle_at_a_time.sql).
    const cycleName = `Ciclo fresco new-path ${runId}`;
    const fd = new FormData();
    fd.set("name", cycleName);
    fd.set("opensAt", todayPlusDays(0));
    fd.set("closesAt", todayPlusDays(30));
    fd.set("participantId", supervisorMemberId);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createFeedbackCycle(fd));

    expect(url).toBe("/dashboard?cycleCreated=1");

    const rows = (await restGet(
      `feedback_cycles?select=id&name=eq.${encodeURIComponent(cycleName)}`,
      supervisorToken
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    freshCycleId = rows[0].id;
  });

  test("RPC rejects (participant already has an open cycle) -> redirects to /dashboard/cycles/nueva?error= with the RPC's own exact message", async () => {
    // Story 7.1 (schema port): the "one open cycle at a time" guard was
    // fixed upstream (renumbered 0070_fix_cycle_conflict_check_uses_status.sql)
    // to check the participant's own feedback_requests.status instead of
    // calendar-date overlap -- evaluatorPool[0] (whichever bucket the seed
    // produced first) may already be closed and no longer conflict. Use
    // readyEmployee, still open at this point in the file (closed later,
    // well past this test), to genuinely exercise the conflict case.
    const fd = new FormData();
    fd.set("name", `Ciclo conflictivo new-path ${runId}`);
    fd.set("opensAt", todayPlusDays(0));
    fd.set("closesAt", todayPlusDays(30));
    fd.set("participantId", readyEmployee.id);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createFeedbackCycle(fd));

    const message = errorFromRedirect(url, "/dashboard/cycles/nueva?error=");
    // Recorded verbatim (static prefix) from create_feedback_cycle's raised
    // exception (supabase/migrations/0023_one_open_cycle_at_a_time.sql:71-72)
    // -- the suffix is a string_agg built at runtime, not asserted verbatim.
    expect(
      message.startsWith(
        "Ya tienen un ciclo 360 abierto, no se les puede incluir en otro hasta que termine: "
      )
    ).toBe(true);
  });
});

describe("Section 1: organizeCycleEvaluators", () => {
  test("as the Supervisor, valid input -> creates the cycle request, redirects to /dashboard?cycleOrganized=1", async () => {
    expect(freshCycleId, "createFeedbackCycle must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);
    const fd = new FormData();
    fd.set("cycleId", freshCycleId);
    evaluatorFormFields(fd, evaluatorIds, EVALUATOR_CATEGORIES);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => organizeCycleEvaluators(fd));

    expect(url).toBe("/dashboard?cycleOrganized=1");

    const rows = (await restGet(
      `feedback_requests?select=id&cycle_id=eq.${freshCycleId}&requester_member_id=eq.${supervisorMemberId}`,
      supervisorToken
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    freshRequestId = rows[0].id;
  });

  test("RPC rejects (already organized for this cycle) -> redirects to /dashboard/cycles/{cycleId}?error= with the RPC's own exact message", async () => {
    expect(freshCycleId, "the previous test must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);
    const fd = new FormData();
    fd.set("cycleId", freshCycleId);
    evaluatorFormFields(fd, evaluatorIds, EVALUATOR_CATEGORIES);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => organizeCycleEvaluators(fd));

    const message = errorFromRedirect(url, `/dashboard/cycles/${freshCycleId}?error=`);
    // Recorded verbatim from organize_cycle_evaluators's raised exception
    // (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql).
    expect(message).toBe("Ya has organizado tus evaluadores para este ciclo.");
  });
});

// ---------------------------------------------------------------------------
// updateCycleRequestEvaluators -- same fresh request (from
// organizeCycleEvaluators above), still zero responses, so this exercises
// the "full replace" branch.
// ---------------------------------------------------------------------------

describe("Section 1: updateCycleRequestEvaluators", () => {
  test("as the Supervisor, valid evaluator set -> redirects to /dashboard/feedback/{requestId}/gestionar?updated=1", async () => {
    expect(freshRequestId, "organizeCycleEvaluators must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);
    const fd = new FormData();
    fd.set("requestId", freshRequestId);
    evaluatorFormFields(fd, evaluatorIds, EVALUATOR_CATEGORIES);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => updateCycleRequestEvaluators(fd));

    expect(url).toBe(`/dashboard/feedback/${freshRequestId}/gestionar?updated=1`);
  });

  test("RPC rejects (request already closed) -> redirects to /dashboard/feedback/{requestId}/gestionar?error= with the RPC's own exact message", async () => {
    // closedEmployee's own request was already closed by
    // scripts/seed-demo-company.mjs (its "cerrado" bucket) -- same
    // fixture Story 3.7's suite uses for this scenario.
    const fd = new FormData();
    fd.set("requestId", closedEmployee.requestId);

    actingAs(closedEmployee.token);
    const url = await getRedirectUrl(() => updateCycleRequestEvaluators(fd));

    const message = errorFromRedirect(
      url,
      `/dashboard/feedback/${closedEmployee.requestId}/gestionar?error=`
    );
    // Recorded verbatim from update_cycle_request_evaluators's raised
    // exception (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql:284).
    expect(message).toBe("Esta solicitud ya no está abierta.");
  });
});

// ---------------------------------------------------------------------------
// createIndividualCycleRequest / updateIndividualCycleRequestEvaluators --
// both require an 'individual'-kind organization, which scripts/seed-demo-company.mjs's
// own org never is. Fixture: fresh individual accounts via
// create_individual_account, used only as plumbing (see helper above) --
// same technique as Story 3.7's own suite.
// ---------------------------------------------------------------------------

describe("Section 1: createIndividualCycleRequest", () => {
  test("as a fresh individual account, valid input -> redirects to /dashboard?requestCreated=1", async () => {
    const email = `individual-a-np-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-np-${runId}@brujula-fake.test`);
    const requestName = `Mi 360 individual new-path ${runId}`;
    const fd = new FormData();
    fd.set("closesAt", todayPlusDays(14));
    fd.set("name", requestName);
    evaluatorEmailFormFields(fd, emails, EVALUATOR_CATEGORIES);

    actingAs(token);
    const url = await getRedirectUrl(() => createIndividualCycleRequest(fd));

    expect(url).toBe("/dashboard?requestCreated=1");

    const rows = (await restGet(
      `feedback_requests?select=id&request_type=eq.cycle&status=eq.open&name=eq.${encodeURIComponent(requestName)}`,
      token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    const requestId = rows[0].id;

    // -----------------------------------------------------------------
    // updateIndividualCycleRequestEvaluators, valid input -- same fresh
    // request (zero responses, still open, closesAt in the future) --
    // "same redirect shape as the member-id variant" per the I/O matrix.
    // -----------------------------------------------------------------
    const newEmails = ["u1", "u2", "u3", "u4", "u5"].map((n) => `${n}-np-${runId}@brujula-fake.test`);
    const updateFd = new FormData();
    updateFd.set("requestId", requestId);
    evaluatorEmailFormFields(updateFd, newEmails, EVALUATOR_CATEGORIES);

    actingAs(token);
    const updateUrl = await getRedirectUrl(() => updateIndividualCycleRequestEvaluators(updateFd));

    expect(updateUrl).toBe(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
  });

  test("RPC rejects (malformed email) -> redirects to /dashboard/feedback/nueva-360?error= with the RPC's own exact message", async () => {
    const email = `individual-b-np-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = [
      `ev1-np-${runId}@brujula-fake.test`,
      `ev2-np-${runId}@brujula-fake.test`,
      `ev3-np-${runId}@brujula-fake.test`,
      `ev4-np-${runId}@brujula-fake.test`,
      "not-an-email",
    ];
    const fd = new FormData();
    fd.set("closesAt", todayPlusDays(14));
    evaluatorEmailFormFields(fd, emails, EVALUATOR_CATEGORIES);

    actingAs(token);
    const url = await getRedirectUrl(() => createIndividualCycleRequest(fd));

    const message = errorFromRedirect(url, "/dashboard/feedback/nueva-360?error=");
    // Recorded verbatim from create_individual_cycle_request's raised
    // exception (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql).
    expect(message).toBe("Algún email no es válido.");
  });

  test("updateIndividualCycleRequestEvaluators RPC rejects (inviting self) -> redirects to /dashboard/feedback/{requestId}/gestionar?error= with the RPC's own exact message", async () => {
    const email = `individual-c-np-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const requestName = `Mi 360 individual C new-path ${runId}`;
    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-c-np-${runId}@brujula-fake.test`);
    const fd = new FormData();
    fd.set("closesAt", todayPlusDays(14));
    fd.set("name", requestName);
    evaluatorEmailFormFields(fd, emails, EVALUATOR_CATEGORIES);

    actingAs(token);
    await getRedirectUrl(() => createIndividualCycleRequest(fd));

    const rows = (await restGet(
      `feedback_requests?select=id&request_type=eq.cycle&status=eq.open&name=eq.${encodeURIComponent(requestName)}`,
      token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    const requestId = rows[0].id;

    // Same 5 valid, distinct emails as above, except the first one is
    // swapped for the account's own email -- reaches
    // update_individual_cycle_request_evaluators's self-invite guard.
    const updateFd = new FormData();
    updateFd.set("requestId", requestId);
    evaluatorEmailFormFields(updateFd, [email, ...emails.slice(1)], EVALUATOR_CATEGORIES);

    actingAs(token);
    const url = await getRedirectUrl(() => updateIndividualCycleRequestEvaluators(updateFd));

    const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}/gestionar?error=`);
    expect(message).toBe(
      "No puedes invitarte a ti mismo como evaluador: tu autoevaluación ya está incluida aparte."
    );
  });
});

// ---------------------------------------------------------------------------
// finalizeCycleRequest -- Investigated (not guessed, per this spec's own
// Intent): the AI-interpretation orchestration
// (generateAiInterpretation/save_ai_interpretation) runs unconditionally,
// unguarded, in BOTH flag branches of src/app/actions/cycles.ts:75-98 --
// save_ai_interpretation's own result is never checked in either branch.
// This test reproduces that exact shape: it asserts only that
// ai_interpretation ends up text-or-null and that the call never throws
// (Story 3.7's own established convention for this same
// non-determinism problem), never that save_ai_interpretation's result was
// checked or guarded -- doing so would assert behavior the production code
// does not have, on either path.
// ---------------------------------------------------------------------------

describe("Section 1: finalizeCycleRequest", () => {
  test("a request eligible to close -> redirects to /dashboard/feedback/{requestId}; AI interpretation saved as text or null, never throws", async () => {
    expect(readyEmployee, "the seed fixture must have produced a 'listo (sin cerrar)' employee").toBeDefined();

    const fd = new FormData();
    fd.set("requestId", readyEmployee.requestId);

    actingAs(readyEmployee.token);
    const url = await getRedirectUrl(() => finalizeCycleRequest(fd));

    expect(url).toBe(`/dashboard/feedback/${readyEmployee.requestId}`);

    const rows = (await restGet(
      `feedback_requests?select=status,ai_interpretation&id=eq.${readyEmployee.requestId}`,
      readyEmployee.token
    )) as { status: string; ai_interpretation: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("closed");

    // Baseline per spec: both outcomes are valid depending on whether
    // ANTHROPIC_API_KEY happens to be set for this process -- never a single
    // hardcoded expectation, and never an assertion that save_ai_interpretation's
    // own result was checked (it isn't, on either the old or new path).
    expect(rows[0].ai_interpretation === null || typeof rows[0].ai_interpretation === "string").toBe(true);
    if (typeof rows[0].ai_interpretation === "string") {
      expect(rows[0].ai_interpretation.length).toBeGreaterThan(0);
    }
    console.log(
      `[new-path-verification] AI interpretation outcome for readyEmployee's request: ${
        rows[0].ai_interpretation === null ? "null (no ANTHROPIC_API_KEY or empty summary)" : "text generated"
      }`
    );
  });

  test("a request not eligible to close -> redirects to /dashboard/feedback/{requestId}?error= with the RPC's own exact message", async () => {
    expect(halfDoneEmployee, "the seed fixture must have produced an 'a medias' employee").toBeDefined();

    const fd = new FormData();
    fd.set("requestId", halfDoneEmployee.requestId);

    actingAs(halfDoneEmployee.token);
    const url = await getRedirectUrl(() => finalizeCycleRequest(fd));

    const message = errorFromRedirect(url, `/dashboard/feedback/${halfDoneEmployee.requestId}?error=`);
    // Recorded verbatim from close_cycle_request's raised exception
    // (supabase/migrations/0060_finalize_cycle_request.sql) -- this
    // request's progress hasn't reached get_feedback_request_progress's
    // "revealed" threshold (min responses + self-evaluation + 80% completion).
    expect(message).toBe(
      "Todavía no se puede finalizar: hace falta llegar al mínimo de respuestas y tu propia autoevaluación."
    );
  });
});

// ---------------------------------------------------------------------------
// get_cycle_status / get_colleagues_with_closed_cycle -- called directly,
// the same way the pages that consume them do (no Server Action wraps
// either); neither was ever flag-gated
// (Story 3.9's routes exist alongside, but the direct-RPC read path these
// pages actually use today is what Story 3.7 characterized) -- included
// here to complete "all Story 3.7-characterized scenarios", per the spec's
// own Approach.
// ---------------------------------------------------------------------------

describe("Section 1: get_cycle_status", () => {
  test("closed cycle -> returns rows with status: 'completado' for participants who finished", async () => {
    const rows = (await callRpc("get_cycle_status", supervisorToken, {
      p_cycle_id: seedCycleId,
    })) as { member_id: string; full_name: string | null; email: string; status: string }[];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.status === "completado")).toBe(true);
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

describe("Section 1: get_colleagues_with_closed_cycle", () => {
  test("returns colleagues in the same company who have a closed 360, excluding the caller", async () => {
    const rows = (await callRpc("get_colleagues_with_closed_cycle", readyEmployee.token, {})) as {
      id: string;
      email: string;
      full_name: string | null;
    }[];

    expect(rows.some((r) => r.id === closedEmployee.id)).toBe(true);
    expect(rows.some((r) => r.id === readyEmployee.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get_request_competency_comparison -- excluded from Story 3.8's flag-gated
// migration (belongs to db/feedback.ts, Story 3.14, per this spec's own
// Intent), so it is never itself flag-gated -- but re-run here end-to-end
// against readyEmployee's request, closed a few tests above via
// finalizeCycleRequest. This
// confirms report-reading integrity post-refactor, matching the shape
// Story 3.7's own baseline already documents.
// ---------------------------------------------------------------------------

describe("Section 1: get_request_competency_comparison (against new-path-produced data)", () => {
  test("request closed via the new path -> returns the comparison shape the report page consumes", async () => {
    const rows = (await callRpc("get_request_competency_comparison", readyEmployee.token, {
      p_request_id: readyEmployee.requestId,
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
    expect(row).toHaveProperty("principle_code");
    expect(row).toHaveProperty("principle_name");
    expect(row).toHaveProperty("role_code");
    expect(row).toHaveProperty("role_name");
  });

  test("as a non-requester, rejects with its exact access-control message", async () => {
    await expect(
      callRpc("get_request_competency_comparison", closedEmployee.token, {
        p_request_id: readyEmployee.requestId,
      })
    ).rejects.toThrow(
      // Recorded verbatim from get_request_competency_comparison's raised
      // exception (supabase/migrations/0054_expose_role_in_competency_reports.sql:179).
      "No tienes acceso a esta solicitud."
    );
  });
});

// ---------------------------------------------------------------------------
// Section 2: static check proving db/cycles.ts (where every real `.rpc()`
// call cyclesManager.ts delegates to actually lives -- cyclesManager.ts
// itself makes zero direct `.rpc()` calls) never references any
// ad-hoc-feedback RPC name -- satisfies AC2's boundary check (AD-3's
// cycles-vs-ad-hoc write-ownership split over the shared feedback_requests
// table) via direct source inspection, not a runtime call-set assertion.
// ---------------------------------------------------------------------------

describe("Section 2: db/cycles.ts never calls an ad-hoc-feedback RPC", () => {
  test("source text contains none of the 3 known ad-hoc-feedback RPC names", () => {
    const source = readFileSync(path.join(REPO_ROOT, "src", "server", "db", "cycles.ts"), "utf8");

    // The exact 3 ad-hoc-feedback RPC names feedbackManager will own
    // (supabase/migrations/0005_ad_hoc_feedback_flow.sql,
    // 0037_individual_accounts.sql, 0014_close_completed_ad_hoc_request.sql),
    // per this spec's own frozen "Always" boundary and
    // ARCHITECTURE-SPINE.md's AD-3.
    expect(source).not.toContain("create_ad_hoc_feedback_request");
    expect(source).not.toContain("create_ad_hoc_feedback_request_for_individual");
    expect(source).not.toContain("close_ad_hoc_feedback_request");
  });
});

// ---------------------------------------------------------------------------
// Section 3: one in-process-vs-HTTP equivalence test for createFeedbackCycle
// -- see file header for why the rejection path (not a second successful
// create) was chosen. halfDoneEmployee's own request stays open for the
// entire file (Section 1's close attempt against it is deliberately
// rejected -- not enough responses yet), unlike readyEmployee (closed by
// Section 1) or evaluatorPool[0] (whichever bucket the seed produced
// first, possibly already closed) -- see Story 7.1's schema-port note on
// the now-status-based "one open cycle at a time" guard
// (renumbered 0070_fix_cycle_conflict_check_uses_status.sql) for why this
// must be a genuinely-still-open participant, not just a seed-fixture
// assumption. Calling it twice, once via the Server Action and once via
// the Route Handler, is a repeatable, side-effect-free equivalence check.
// ---------------------------------------------------------------------------

describe("Section 3: createFeedbackCycle in-process vs. POST /api/cycles over HTTP", () => {
  test("same conflicting participant -> both surfaces reject with the exact same message", async () => {
    const fd = new FormData();
    fd.set("name", `Ciclo conflictivo equiv in-process ${runId}`);
    fd.set("opensAt", todayPlusDays(0));
    fd.set("closesAt", todayPlusDays(30));
    fd.set("participantId", halfDoneEmployee.id);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createFeedbackCycle(fd));
    const inProcessMessage = errorFromRedirect(url, "/dashboard/cycles/nueva?error=");
    expect(
      inProcessMessage.startsWith(
        "Ya tienen un ciclo 360 abierto, no se les puede incluir en otro hasta que termine: "
      )
    ).toBe(true);

    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        name: `Ciclo conflictivo equiv route ${runId}`,
        opensAt: todayPlusDays(0),
        closesAt: todayPlusDays(30),
        participantMemberIds: [halfDoneEmployee.id],
      },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: inProcessMessage,
      },
    });
  });
});
