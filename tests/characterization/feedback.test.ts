// Story 3.13 (_bmad-output/implementation-artifacts/
// spec-3-13-characterization-tests-feedback-baseline.md): originally
// characterization tests for src/app/actions/feedback.ts's 5 in-scope
// Server Actions (createFeedbackRequest, createFeedbackRequestForIndividual,
// cancelFeedbackRequest, closeFeedbackRequest,
// updateFeedbackRequestEvaluators) plus the direct-RPC read paths the
// ad-hoc-feedback domain feeds (get_request_competency_narrative,
// get_my_pending_invitations), run against a real, local `supabase start`
// instance. This was the baseline Epic 3's feedback domain migration
// (3.13-3.18) re-verified against, mirroring Story 3.7's own proven
// technique for cycles.ts.
//
// Story 5.1c (_bmad-output/implementation-artifacts/
// spec-5-1c-delete-old-path-feedback-responder.md) retired this file's
// per-action assertions once the ad-hoc-feedback domain's per-action flag
// was deleted: calling these 5 Server Actions no longer exercises a
// distinct "old path" (there is only one path left, and
// tests/integration/feedback-new-path-verification.test.ts already asserts
// the exact same redirect URLs/error messages
// unconditionally). What remains here is what was never flag-gated: the two
// direct-RPC reads (get_request_competency_narrative,
// get_my_pending_invitations), called the same way
// dashboard/feedback/[id]/page.tsx:367-368 and dashboard/page.tsx:180 call
// them (neither is wrapped by a Server Action) -- only 2 of the 5 Server
// Actions above (createFeedbackRequest, closeFeedbackRequest) are still
// invoked here, kept only as fixture-building plumbing to reach the states
// those reads need, with no assertion on their own redirect/error behavior.
// The other 3 (createFeedbackRequestForIndividual, cancelFeedbackRequest,
// updateFeedbackRequestEvaluators) were removed outright -- see the note
// further down, where their describe blocks used to live.
//
// Deliberately excluded (see the spec's frozen Intent for the
// investigated reasoning behind each):
// - submitFeedbackResponse (feedback.ts:109-165) -- token-based,
//   unauthenticated, responder/invitation-domain scope (Story 3.19). Its
//   underlying RPC, submit_feedback_response, IS called directly below,
//   but only as fixture-building plumbing (to produce a specific response
//   count for the threshold scenarios), never through the Server Action.
// - get_request_competency_comparison -- already frozen by Story 3.7
//   (tests/characterization/cycles.test.ts:714-757), confirmed
//   cycle-exclusive (dashboard/feedback/[id]/page.tsx:372-373 gates it
//   `revealed && isCycle`). Not re-characterized here.
//
// What's real: the Server Actions themselves, every Postgres RPC they
// call, and get_request_competency_narrative/get_my_pending_invitations
// called directly the same way dashboard/feedback/[id]/page.tsx:367-368
// and dashboard/page.tsx:180 call them (neither is wrapped by a Server
// Action).
//
// What's mocked, and why: only next/navigation, next/cache and
// @/lib/supabase/server -- confirmed by reading feedback.ts that none of
// its 5 in-scope actions ever touch cookies directly, every one only
// calls `supabase.rpc(...)` via the mocked client factory. Same
// investigated, accurate mock list Story 3.7 already established for
// cycles.ts (differs from the frozen Intent's stated
// next/navigation/next/cache wording only in being explicit that
// next/headers is never needed here either -- noted per that story's own
// precedent for documenting this kind of wording gap in Implementation
// Notes rather than editing the frozen block).
//
// Fixture: one fresh demo company per test run via
// scripts/seed-demo-company.mjs (same execFileSync + stdout-regex-parsing
// technique cycles.test.ts already established), which gives us the
// org/employee infrastructure this story's Approach calls for -- but
// every ad-hoc feedback request/response actually under test is created
// directly by this file via the real Server Actions/RPCs, never through
// the seed script's own internal calls (which only ever build 360-cycle
// requests, never ad-hoc ones).

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
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
import { createFeedbackRequest, closeFeedbackRequest } from "@/app/actions/feedback";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and tests/characterization/cycles.test.ts.
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
 * calling this RPC directly. Handles both templates this file's fixtures
 * use: the 'general' subtype's all-'open' questions and the 'competencias'
 * subtype's all-'competency' questions. */
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
// employees -- plenty for 6 distinct ad-hoc requesters, each needing >= 5
// invitees excluding themselves, plus a couple spare). Every ad-hoc
// feedback request/response actually under test is built directly through
// the real actions/RPCs under test, never through the seed script (whose
// own fixture-building only ever touches the 360-cycle flow).
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
  const companyName = `Char Test Feedback ${runId}`;
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
// createFeedbackRequest, createFeedbackRequestForIndividual,
// updateFeedbackRequestEvaluators, cancelFeedbackRequest -- their own
// redirect-URL/error-message assertions were retired by Story 5.1c: they
// characterized old-path behavior no longer reachable, and the identical
// assertions already run unconditionally in
// tests/integration/feedback-new-path-verification.test.ts. None of the 3
// employees (createFeedbackRequest's requester, createFeedbackRequestFor-
// Individual's two individual accounts, updateFeedbackRequestEvaluators'
// requesters, cancelFeedbackRequest's requester) feed any later fixture in
// this file, so their describe blocks are removed outright rather than kept
// as unasserted plumbing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// closeFeedbackRequest -- kept only as fixture-building plumbing (its own
// redirect/error assertions were retired by Story 5.1c, same reasoning as
// the removed describe blocks above) to reach the "closed request with >= 3
// peer responses" state the ad-hoc narrative-report RPC
// (get_request_competency_narrative) needs to test its above-reveal-
// threshold behavior, which is NOT flag-gated (no Server Action wraps it).
// ---------------------------------------------------------------------------

describe("get_request_competency_narrative (closed, above threshold)", () => {
  let requester: SeededEmployee;
  let requestId: string;
  let invitees: SeededEmployee[];

  beforeAll(async () => {
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

    // 3 of the 5 invitees respond -- the min_responses_to_reveal default
    // (supabase/migrations/0001_initial_schema.sql:51).
    await respondAsEvaluator(invitees[0].token, requester.id);
    await respondAsEvaluator(invitees[1].token, requester.id);
    await respondAsEvaluator(invitees[2].token, requester.id);

    const closeFd = new FormData();
    closeFd.set("requestId", requestId);

    actingAs(requester.token);
    await getRedirectUrl(() => closeFeedbackRequest(closeFd));
  });

  // -------------------------------------------------------------------
  // get_request_competency_narrative -- called directly, the same way
  // src/app/dashboard/feedback/[id]/page.tsx:367-368 calls it (gated
  // `revealed && !isCycle`; no Server Action wraps it).
  // -------------------------------------------------------------------

  test("above threshold -> returns revealed content grouped by competency", async () => {
    expect(requestId, "the beforeAll fixture must have run first").toBeDefined();

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
    // answer_value (4) and comment text (respondAsEvaluator's own fixture
    // shape) -- at least one grouped row should reflect all 3 mentions,
    // and its average is deterministic, not just numeric.
    const fullyMentionedRow = rows.find((r) => r.mention_count === 3);
    expect(fullyMentionedRow).toBeDefined();
    expect(fullyMentionedRow!.avg_value).toBe(4);
  });

  test("non-requester access -> throws its exact access-control message", async () => {
    expect(requestId, "the beforeAll fixture must have run first").toBeDefined();

    // One of the request's own invitees -- a real participant, but never
    // the requester itself, which is the only caller this RPC allows.
    await expect(
      callRpc("get_request_competency_narrative", invitees[0].token, { p_request_id: requestId })
    ).rejects.toThrow(
      // Recorded verbatim from get_request_competency_narrative's raised
      // exception (supabase/migrations/0058_competency_narrative_report.sql:50).
      "No tienes acceso a esta solicitud."
    );
  });
});

// ---------------------------------------------------------------------------
// get_request_competency_narrative, below threshold -- and, sharing the
// same fixture, get_my_pending_invitations (an unused invitation from this
// same request is exactly what "pending invitation" means).
// ---------------------------------------------------------------------------

describe("get_request_competency_narrative below threshold, and get_my_pending_invitations", () => {
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

    // Only 2 of the 5 invitees respond -- below the min_responses_to_reveal
    // default of 3. invitees[2..4] are deliberately left with their
    // invitation unused, for the get_my_pending_invitations scenario below.
    await respondAsEvaluator(invitees[0].token, requester.id);
    await respondAsEvaluator(invitees[1].token, requester.id);
  });

  test("get_request_competency_narrative, below threshold -> returns the not-revealed state (empty), no content", async () => {
    const rows = await callRpc("get_request_competency_narrative", requester.token, {
      p_request_id: requestId,
    });

    // get_request_competency_narrative's own early `return;` before its
    // reveal-threshold check (supabase/migrations/0058_competency_narrative_
    // report.sql:61-63) yields an empty result set, not partial content --
    // matching the same byte-withholding confidentiality boundary the
    // frozen Intent requires.
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
