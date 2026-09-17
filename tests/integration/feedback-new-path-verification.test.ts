// Story 3.18 (_bmad-output/implementation-artifacts/
// spec-3-18-feedback-new-path-verification.md), updated by Story 5.1c
// (_bmad-output/implementation-artifacts/
// spec-5-1c-delete-old-path-feedback-responder.md) once the ad-hoc-feedback
// domain's per-action flag was deleted and the manager-backed path became
// the only path -- two sections, mirroring Story 3.12's proven shape
// exactly (real Supabase, no manager/RPC mocking):
//
// (1) re-runs Story 3.13's characterized scenarios
// (tests/characterization/feedback.test.ts) against the Server Actions,
// for all 5 previously-flagged feedback.ts functions plus
// both direct-RPC read scenarios (get_request_competency_narrative,
// get_my_pending_invitations), asserting the exact same redirect
// URLs/error messages/RPC output shapes that baseline already documents --
// including dedicated exactly-2-responses (below floor) and
// exactly-3-responses (at floor) scenarios, per epics.md's explicit
// extra-scrutiny requirement on the anonymity-threshold behavior (the
// product's core trust guarantee). submitFeedbackResponse is used only as
// fixture-building plumbing via direct RPC, same allowance Story 3.13
// established -- it belongs to the responder-domain scope, not this one.
//
// (2) a static source-inspection check proving db/feedback.ts -- where
// every real `.rpc()` call feedbackManager delegates to actually lives
// (feedbackManager.ts itself makes zero direct `.rpc()` calls, confirmed
// via `grep -n "rpc(" src/server/managers/feedbackManager.ts` returning
// nothing) -- never references any cycle-lifecycle RPC name, completing
// Story 3.12's one-sided check; plus the reverse direction (db/cycles.ts
// never references any ad-hoc-feedback RPC name), already proven by Story
// 3.12, re-asserted here in one place per the AC's literal "compared
// against each other" framing.
//
// What's real: the Server Actions, feedbackManager, db/feedback.ts, and
// every Postgres RPC underneath, run against the local `supabase start`
// instance. What's mocked, and why: only the bits of Next.js plumbing that
// need a live request (`redirect`, `revalidatePath`) and the cookie-based
// Supabase client factory (`@/lib/supabase/server`) -- exactly Story
// 3.13's own mocks (none of feedback.ts's 5 in-scope actions touch
// cookies).

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

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

// ---------------------------------------------------------------------------
// Mocks -- identical to tests/characterization/feedback.test.ts (Story
// 3.13), see file header for what and why.
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
// these, the unmodified Story 3.16 file, picks up the mocked
// `next/navigation`, `next/cache` and `@/lib/supabase/server`.
import {
  createFeedbackRequest,
  createFeedbackRequestForIndividual,
  cancelFeedbackRequest,
  closeFeedbackRequest,
  updateFeedbackRequestEvaluators,
} from "@/app/actions/feedback";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and tests/characterization/feedback.test.ts.
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
 * create_individual_account -- the only way to reach
 * createFeedbackRequestForIndividual's success path, same helper Story
 * 3.13's suite already established. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

type PendingInvitation = {
  token: string;
  created_at: string;
  evaluator_category: string | null;
  requester_member_id: string;
  requester_full_name: string | null;
  requester_email: string;
};

type ResponderQuestion = {
  id: string;
  question_type: string;
  max_selections: number | null;
};

type ResponderContext = {
  valid: boolean;
  used?: boolean;
  questions?: ResponderQuestion[];
  competencies?: { code: string; name: string }[];
};

/** Fetches the caller's pending invitation from a specific requester, then
 * submits a full answer set via submit_feedback_response -- fixture-building
 * infrastructure only (to produce a specific response count ahead of the
 * threshold scenarios below), per the spec's own explicit allowance for
 * calling this RPC directly (submitFeedbackResponse itself is untouched,
 * unflagged, responder-domain scope). Same helper Story 3.13's suite
 * already established. */
async function respondAsEvaluator(evaluatorToken: string, requesterMemberId: string): Promise<void> {
  const pending = (await callRpc("get_my_pending_invitations", evaluatorToken, {})) as PendingInvitation[];
  const invite = pending.find((p) => p.requester_member_id === requesterMemberId);
  if (!invite) {
    throw new Error(`test bug: no pending invitation found from requester ${requesterMemberId}`);
  }

  const ctx = (await callRpc("get_responder_context", evaluatorToken, {
    p_token: invite.token,
  })) as ResponderContext;
  if (!ctx.valid || !ctx.questions) {
    throw new Error(`get_responder_context returned invalid context: ${JSON.stringify(ctx)}`);
  }

  const competencyCode = ctx.competencies?.[0]?.code;
  const answers = ctx.questions.map((q) => {
    if (q.question_type === "competency") {
      return {
        question_id: q.id,
        competency_code: competencyCode,
        answer_value: 4,
        answer_text: "Comentario de prueba.",
      };
    }
    if (q.question_type === "scale") {
      return { question_id: q.id, answer_value: 4 };
    }
    return { question_id: q.id, answer_text: "Respuesta de prueba." };
  });

  await callRpc("submit_feedback_response", evaluatorToken, { p_token: invite.token, p_answers: answers });
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (8
// employees -- same technique and headcount as Story 3.13's own suite: 6
// distinct requesters, each needing >= 5 invitees excluding themselves,
// plus a couple spare). Every ad-hoc feedback request/response actually
// under test is built directly through the real actions/RPCs under test,
// never through the seed script itself (whose own fixture-building only
// ever touches the 360-cycle flow).
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let employees: SeededEmployee[]; // all 8 seeded employees, logged in

const runId = Date.now();

function inviteesExcluding(requesterId: string, count = 5): string[] {
  return employees
    .filter((e) => e.id !== requesterId)
    .slice(0, count)
    .map((e) => e.id);
}

beforeAll(async () => {
  const companyName = `New Path Verif Feedback ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "8"], {
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
  const supervisorEmail = supervisorMatch[1];
  const supervisorToken = await login(supervisorEmail, PASSWORD);

  const employeeEmails: string[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: .+$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employeeEmails.push(m[1]);
  }
  if (employeeEmails.length < 8) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 8 empleados esperados (obtuvo ${employeeEmails.length}). ` +
        `Salida completa:\n${seedOutput}`
    );
  }

  const memberRows = (await restGet(
    `members?select=id,email&email=in.(${employeeEmails.join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));

  employees = await Promise.all(
    employeeEmails.map(async (email) => ({
      email,
      token: await login(email, PASSWORD),
      id: idByEmail[email],
    }))
  );
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// Section 1: Story 3.13's characterized scenarios, re-run against the
// Server Actions -- every assertion below is
// copied verbatim from tests/characterization/feedback.test.ts.
// ---------------------------------------------------------------------------

describe("Section 1: createFeedbackRequest", () => {
  test("valid invitees (>= 5) -> redirects to /dashboard?requestCreated=1", async () => {
    const requester = employees[0];
    const fd = new FormData();
    inviteesExcluding(requester.id, 5).forEach((id) => fd.append("inviteeIds", id));

    actingAs(requester.token);
    const url = await getRedirectUrl(() => createFeedbackRequest(fd));

    expect(url).toBe("/dashboard?requestCreated=1");

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
  });

  test("below min-invitees (< 5) -> redirects to /dashboard/feedback/nueva?error= with the RPC's own exact message", async () => {
    const requester = employees[1];
    const fd = new FormData();
    inviteesExcluding(requester.id, 2).forEach((id) => fd.append("inviteeIds", id));

    actingAs(requester.token);
    const url = await getRedirectUrl(() => createFeedbackRequest(fd));

    const message = errorFromRedirect(url, "/dashboard/feedback/nueva?error=");
    // Recorded verbatim from create_ad_hoc_feedback_request's raised
    // exception (supabase/migrations/0057_feedback_request_name.sql:64),
    // same as Story 3.13's baseline. min_invitees defaults to 5
    // (supabase/migrations/0001_initial_schema.sql:50).
    expect(message).toBe("Tienes que invitar al menos a 5 personas.");
  });
});

// ---------------------------------------------------------------------------
// createFeedbackRequestForIndividual -- requires an 'individual'-kind
// organization, which scripts/seed-demo-company.mjs's own org never is.
// Fixture: fresh individual accounts via create_individual_account, used
// only as plumbing -- same technique Story 3.13's suite already
// established.
// ---------------------------------------------------------------------------

describe("Section 1: createFeedbackRequestForIndividual", () => {
  test("valid emails -> redirects to /dashboard?requestCreated=1", async () => {
    const email = `individual-a-np-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-np-${runId}@brujula-fake.test`);
    const fd = new FormData();
    emails.forEach((e) => fd.append("inviteeEmails", e));

    actingAs(token);
    const url = await getRedirectUrl(() => createFeedbackRequestForIndividual(fd));

    expect(url).toBe("/dashboard?requestCreated=1");

    const rows = (await restGet(
      `feedback_requests?select=id&request_type=eq.ad_hoc&status=eq.open`,
      token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
  });

  test("RPC rejects (malformed email) -> redirects to /dashboard/feedback/nueva?error= with the RPC's own exact message", async () => {
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
    emails.forEach((e) => fd.append("inviteeEmails", e));

    actingAs(token);
    const url = await getRedirectUrl(() => createFeedbackRequestForIndividual(fd));

    const message = errorFromRedirect(url, "/dashboard/feedback/nueva?error=");
    // Recorded verbatim from create_ad_hoc_feedback_request_for_individual's
    // raised exception (supabase/migrations/0057_feedback_request_name.sql:180),
    // same as Story 3.13's baseline.
    expect(message).toBe("Algún email no es válido.");
  });
});

// ---------------------------------------------------------------------------
// updateFeedbackRequestEvaluators -- fresh request, still zero responses,
// so this exercises the "full replace" branch (the only branch this RPC
// has). Same 5-guard-clause structure and fixture layout as Story 3.13's
// own suite: below-min-invitees/self-invite/supervisor-invitee reused
// against the same still-open, zero-response request; has-responses
// against a separate requester who actually collected one response.
// ---------------------------------------------------------------------------

describe("Section 1: updateFeedbackRequestEvaluators", () => {
  test("as the requester, valid input -> redirects to /dashboard/feedback/{requestId}?updated=1", async () => {
    const requester = employees[2];
    const createFd = new FormData();
    inviteesExcluding(requester.id, 5).forEach((id) => createFd.append("inviteeIds", id));

    actingAs(requester.token);
    await getRedirectUrl(() => createFeedbackRequest(createFd));

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    const requestId = rows[0].id;

    const updateFd = new FormData();
    updateFd.set("requestId", requestId);
    inviteesExcluding(requester.id, 6)
      .slice(1)
      .forEach((id) => updateFd.append("inviteeIds", id));

    actingAs(requester.token);
    const url = await getRedirectUrl(() => updateFeedbackRequestEvaluators(updateFd));

    expect(url).toBe(`/dashboard/feedback/${requestId}?updated=1`);
  });

  describe("RPC rejects, zero-response guards (same still-open request reused across all three)", () => {
    let requester: SeededEmployee;
    let requestId: string;

    beforeAll(async () => {
      requester = employees[6];
      const createFd = new FormData();
      inviteesExcluding(requester.id, 5).forEach((id) => createFd.append("inviteeIds", id));

      actingAs(requester.token);
      await getRedirectUrl(() => createFeedbackRequest(createFd));

      const rows = (await restGet(
        `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
        requester.token
      )) as { id: string }[];
      expect(rows).toHaveLength(1);
      requestId = rows[0].id;
    });

    test("below min-invitees (< 5) -> redirects with the RPC's own exact message", async () => {
      const updateFd = new FormData();
      updateFd.set("requestId", requestId);
      inviteesExcluding(requester.id, 2).forEach((id) => updateFd.append("inviteeIds", id));

      actingAs(requester.token);
      const url = await getRedirectUrl(() => updateFeedbackRequestEvaluators(updateFd));

      const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}?error=`);
      expect(message).toBe("Tienes que invitar al menos a 5 personas.");
    });

    test("self-invite -> redirects with the RPC's own exact message", async () => {
      const updateFd = new FormData();
      updateFd.set("requestId", requestId);
      inviteesExcluding(requester.id, 4).forEach((id) => updateFd.append("inviteeIds", id));
      updateFd.append("inviteeIds", requester.id);

      actingAs(requester.token);
      const url = await getRedirectUrl(() => updateFeedbackRequestEvaluators(updateFd));

      const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}?error=`);
      expect(message).toBe("No puedes invitarte a ti mismo.");
    });

    test("supervisor as invitee -> redirects with the RPC's own exact message", async () => {
      const supervisorRow = (await restGet(
        `members?select=id&is_supervisor=eq.true`,
        requester.token
      )) as { id: string }[];
      expect(supervisorRow, "seed-demo-company.mjs always creates exactly one Supervisor").toHaveLength(1);

      const updateFd = new FormData();
      updateFd.set("requestId", requestId);
      inviteesExcluding(requester.id, 4).forEach((id) => updateFd.append("inviteeIds", id));
      updateFd.append("inviteeIds", supervisorRow[0].id);

      actingAs(requester.token);
      const url = await getRedirectUrl(() => updateFeedbackRequestEvaluators(updateFd));

      const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}?error=`);
      expect(message).toBe(
        "Todos los invitados deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback)."
      );
    });
  });

  test("RPC rejects (has responses) -> redirects with the RPC's own exact message", async () => {
    const requester = employees[7];
    const createFd = new FormData();
    const inviteeIds = inviteesExcluding(requester.id, 5);
    createFd.set("subtype", "general");
    inviteeIds.forEach((id) => createFd.append("inviteeIds", id));

    actingAs(requester.token);
    await getRedirectUrl(() => createFeedbackRequest(createFd));

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    const requestId = rows[0].id;

    const invitee = employees.find((e) => e.id === inviteeIds[0])!;
    await respondAsEvaluator(invitee.token, requester.id);

    const updateFd = new FormData();
    updateFd.set("requestId", requestId);
    inviteesExcluding(requester.id, 6)
      .slice(1)
      .forEach((id) => updateFd.append("inviteeIds", id));

    actingAs(requester.token);
    const url = await getRedirectUrl(() => updateFeedbackRequestEvaluators(updateFd));

    const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}?error=`);
    expect(message).toBe("No se puede modificar: ya hay respuestas.");
  });
});

// ---------------------------------------------------------------------------
// cancelFeedbackRequest
// ---------------------------------------------------------------------------

describe("Section 1: cancelFeedbackRequest", () => {
  let requester: SeededEmployee;
  let requestId: string;

  test("as the requester, valid -> redirects to /dashboard?requestCancelled=1", async () => {
    requester = employees[3];
    const createFd = new FormData();
    inviteesExcluding(requester.id, 5).forEach((id) => createFd.append("inviteeIds", id));

    actingAs(requester.token);
    await getRedirectUrl(() => createFeedbackRequest(createFd));

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    requestId = rows[0].id;

    const cancelFd = new FormData();
    cancelFd.set("requestId", requestId);

    actingAs(requester.token);
    const url = await getRedirectUrl(() => cancelFeedbackRequest(cancelFd));

    expect(url).toBe("/dashboard?requestCancelled=1");
  });

  test("RPC rejects (already closed/cancelled) -> redirects to /dashboard/feedback/{requestId}?error= with the RPC's own exact message ('ya no está abierta')", async () => {
    expect(requestId, "the previous test must have run first").toBeDefined();

    const cancelFd = new FormData();
    cancelFd.set("requestId", requestId);

    actingAs(requester.token);
    const url = await getRedirectUrl(() => cancelFeedbackRequest(cancelFd));

    const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}?error=`);
    // Recorded verbatim from cancel_ad_hoc_feedback_request's raised
    // exception (supabase/migrations/0011_ad_hoc_request_lifecycle.sql:110),
    // same as Story 3.13's baseline.
    expect(message).toBe("Esta solicitud ya no está abierta.");
  });
});

// ---------------------------------------------------------------------------
// closeFeedbackRequest -- and, sharing the same fixture, the ad-hoc
// narrative-report RPC (get_request_competency_narrative) above its reveal
// threshold. This request's 3 responses are the "dedicated
// exactly-3-responses (at floor)" scenario the spec calls for -- same
// fixture shape Story 3.13's baseline established.
// ---------------------------------------------------------------------------

describe("Section 1: closeFeedbackRequest", () => {
  let requester: SeededEmployee;
  let requestId: string;
  let invitees: SeededEmployee[];

  test("eligible to close (>= 3 responses) -> redirects to /dashboard?requestClosed=1", async () => {
    requester = employees[4];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    const createFd = new FormData();
    createFd.set("subtype", "competencias"); // so the narrative-report test has competency-coded answers to read
    inviteeIds.forEach((id) => createFd.append("inviteeIds", id));

    actingAs(requester.token);
    await getRedirectUrl(() => createFeedbackRequest(createFd));

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    requestId = rows[0].id;

    // Exactly 3 of the 5 invitees respond -- the min_responses_to_reveal
    // default (supabase/migrations/0001_initial_schema.sql:51), i.e. the
    // "at floor" scenario, run here against the new path.
    await respondAsEvaluator(invitees[0].token, requester.id);
    await respondAsEvaluator(invitees[1].token, requester.id);
    await respondAsEvaluator(invitees[2].token, requester.id);

    const closeFd = new FormData();
    closeFd.set("requestId", requestId);

    actingAs(requester.token);
    const url = await getRedirectUrl(() => closeFeedbackRequest(closeFd));

    expect(url).toBe("/dashboard?requestClosed=1");
  });

  test("RPC rejects (already closed) -> redirects to /dashboard/feedback/{requestId}?error= with the RPC's own exact message ('ya no está abierta')", async () => {
    expect(requestId, "the previous test must have run first").toBeDefined();

    const closeFd = new FormData();
    closeFd.set("requestId", requestId);

    actingAs(requester.token);
    const url = await getRedirectUrl(() => closeFeedbackRequest(closeFd));

    const message = errorFromRedirect(url, `/dashboard/feedback/${requestId}?error=`);
    // Recorded verbatim from close_ad_hoc_feedback_request's raised
    // exception (supabase/migrations/0014_close_completed_ad_hoc_request.sql:33),
    // same as Story 3.13's baseline -- this RPC has no response-count
    // threshold check at all, only requester-owns-it and status = 'open'.
    expect(message).toBe("Esta solicitud ya no está abierta.");
  });

  // -------------------------------------------------------------------
  // get_request_competency_narrative -- called directly, the same way
  // src/app/dashboard/feedback/[id]/page.tsx calls it (gated
  // `revealed && !isCycle`; no Server Action wraps it, so this RPC is
  // included here per the spec's
  // own Approach ("both direct-RPC read scenarios") to complete "all
  // Story 3.13-characterized scenarios" and to exercise the
  // "at-threshold" (exactly 3 responses) reveal condition explicitly,
  // per epics.md's extra-scrutiny requirement on anonymity behavior.
  // -------------------------------------------------------------------

  describe("get_request_competency_narrative, exactly 3 responses (at floor)", () => {
    test("returns revealed content grouped by competency -- matches baseline's above-threshold shape exactly", async () => {
      expect(requestId, "the closeFeedbackRequest tests must have run first").toBeDefined();

      const rows = (await callRpc("get_request_competency_narrative", requester.token, {
        p_request_id: requestId,
      })) as {
        question_position: number;
        question_prompt: string;
        competency_code: string;
        competency_name: string;
        role_code: string | null;
        mention_count: number;
        avg_value: number;
        comments: string[];
      }[];

      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0];
      expect(row).toHaveProperty("question_position");
      expect(row).toHaveProperty("question_prompt");
      expect(row).toHaveProperty("competency_code");
      expect(row).toHaveProperty("competency_name");
      expect(row).toHaveProperty("role_code");
      expect(typeof row.mention_count).toBe("number");
      expect(row.mention_count).toBeGreaterThan(0);
      expect(Array.isArray(row.comments)).toBe(true);
      // All 3 evaluators answered with the same fixed competency code,
      // answer_value (4) and comment text (respondAsEvaluator's own
      // fixture shape) -- at least one grouped row should reflect all 3
      // mentions, and its average is deterministic, not just numeric.
      const fullyMentionedRow = rows.find((r) => r.mention_count === 3);
      expect(fullyMentionedRow).toBeDefined();
      expect(fullyMentionedRow!.avg_value).toBe(4);
    });

    test("non-requester access -> throws its exact access-control message", async () => {
      expect(requestId, "the closeFeedbackRequest tests must have run first").toBeDefined();

      await expect(
        callRpc("get_request_competency_narrative", invitees[0].token, { p_request_id: requestId })
      ).rejects.toThrow(
        // Recorded verbatim from get_request_competency_narrative's raised
        // exception (supabase/migrations/0058_competency_narrative_report.sql:50),
        // same as Story 3.13's baseline.
        "No tienes acceso a esta solicitud."
      );
    });
  });
});

// ---------------------------------------------------------------------------
// get_request_competency_narrative, exactly 2 responses (below floor) --
// and, sharing the same fixture, get_my_pending_invitations (an unused
// invitation from this same request is exactly what "pending invitation"
// means). This request's 2 responses are the "dedicated
// exactly-2-responses (below floor)" scenario the spec calls for -- same
// fixture shape Story 3.13's baseline established.
// ---------------------------------------------------------------------------

describe("Section 1: get_request_competency_narrative, exactly 2 responses (below floor), and get_my_pending_invitations", () => {
  let requester: SeededEmployee;
  let requestId: string;
  let invitees: SeededEmployee[];

  beforeAll(async () => {
    requester = employees[5];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    const createFd = new FormData();
    inviteeIds.forEach((id) => createFd.append("inviteeIds", id));

    actingAs(requester.token);
    await getRedirectUrl(() => createFeedbackRequest(createFd));

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    requestId = rows[0].id;

    // Exactly 2 of the 5 invitees respond -- below the
    // min_responses_to_reveal default of 3, i.e. the "below floor"
    // scenario. invitees[2..4] are deliberately left with their
    // invitation unused, for the get_my_pending_invitations scenario
    // below.
    await respondAsEvaluator(invitees[0].token, requester.id);
    await respondAsEvaluator(invitees[1].token, requester.id);
  });

  test("get_request_competency_narrative, exactly 2 responses -> returns [], no content -- matches baseline's below-threshold state exactly", async () => {
    const rows = await callRpc("get_request_competency_narrative", requester.token, {
      p_request_id: requestId,
    });

    // get_request_competency_narrative's own early `return;` before its
    // reveal-threshold check (supabase/migrations/0058_competency_narrative_
    // report.sql:61-63) yields an empty result set, not partial content --
    // matching the same byte-withholding confidentiality boundary the
    // frozen Intent requires, and the exact behavior Story 3.13's baseline
    // documents for this state.
    expect(rows).toEqual([]);
  });

  test("get_my_pending_invitations, valid -> returns the pending-invitation row for an invitee who hasn't responded", async () => {
    const unresponded = invitees[2];

    const rows = (await callRpc("get_my_pending_invitations", unresponded.token, {})) as PendingInvitation[];

    const row = rows.find((r) => r.requester_member_id === requester.id);
    expect(row).toBeDefined();
    expect(row!.token).toBeTruthy();
    expect(row!.requester_email).toBe(requester.email);
    expect(row!).toHaveProperty("created_at");
    expect(row!).toHaveProperty("evaluator_category");
  });
});

// ---------------------------------------------------------------------------
// Section 2: static check proving db/feedback.ts (where every real
// `.rpc()` call feedbackManager.ts delegates to actually lives --
// feedbackManager.ts itself makes zero direct `.rpc()` calls) never
// references any cycle-lifecycle RPC name -- completes Story 3.12's
// one-sided check, satisfying AD-3's ad-hoc-vs-cycle write-ownership split
// over the shared feedback_requests table via direct source inspection,
// not a runtime call-set assertion.
//
// The reverse direction (db/cycles.ts never references any ad-hoc-feedback
// RPC name) is already proven by Story 3.12's own suite
// (tests/integration/cycles-new-path-verification.test.ts) -- re-asserted
// here in one place per the AC's literal "compared against each other"
// framing (cheap, not required to be new).
// ---------------------------------------------------------------------------

describe("Section 2: db/feedback.ts never calls a cycle-lifecycle RPC", () => {
  test("source text contains none of the 8 known cycle-lifecycle RPC names", () => {
    const source = readFileSync(path.join(REPO_ROOT, "src", "server", "db", "feedback.ts"), "utf8");

    // The complete set of cycle-lifecycle RPC names cyclesManager owns
    // (supabase/migrations/0007_360_cycle_flow.sql,
    // 0060_finalize_cycle_request.sql,
    // 0050_cycle_closing_date_and_edit_rules.sql, and others), per this
    // spec's own frozen "Always" boundary and ARCHITECTURE-SPINE.md's AD-3.
    expect(source).not.toContain("create_feedback_cycle");
    expect(source).not.toContain("close_cycle_request");
    expect(source).not.toContain("organize_cycle_evaluators");
    expect(source).not.toContain("create_individual_cycle_request");
    expect(source).not.toContain("update_cycle_request_evaluators");
    expect(source).not.toContain("update_individual_cycle_request_evaluators");
    expect(source).not.toContain("get_cycle_status");
    expect(source).not.toContain("get_colleagues_with_closed_cycle");
  });
});

describe("Section 2: db/cycles.ts never calls an ad-hoc-feedback RPC (re-confirmation)", () => {
  test("source text contains none of the 7 known ad-hoc-feedback RPC names", () => {
    const source = readFileSync(path.join(REPO_ROOT, "src", "server", "db", "cycles.ts"), "utf8");

    // The complete set of ad-hoc-feedback RPC names, same assertion Story
    // 3.12's own suite already proves
    // (supabase/migrations/0005_ad_hoc_feedback_flow.sql,
    // 0037_individual_accounts.sql,
    // 0014_close_completed_ad_hoc_request.sql, and others) -- re-run here
    // in one place per the AC's literal "compared against each other"
    // framing.
    expect(source).not.toContain("create_ad_hoc_feedback_request");
    expect(source).not.toContain("create_ad_hoc_feedback_request_for_individual");
    expect(source).not.toContain("close_ad_hoc_feedback_request");
    expect(source).not.toContain("cancel_ad_hoc_feedback_request");
    expect(source).not.toContain("update_ad_hoc_feedback_request_evaluators");
    expect(source).not.toContain("get_request_competency_narrative");
    expect(source).not.toContain("get_my_pending_invitations");
  });
});
