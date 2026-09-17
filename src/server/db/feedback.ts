// Story 3.14 (_bmad-output/implementation-artifacts/
// spec-3-14-db-access-manager-scaffolding-feedback.md): db-access layer for
// the ad-hoc-feedback domain (spec.md sección 4.1). Thin, typed wrappers
// around the 5 in-scope ad-hoc-lifecycle RPCs plus the domain's two
// direct-RPC read paths, mirroring Story 3.8's src/server/db/cycles.ts
// shape exactly -- this file is deliberately the only new code for this
// domain that constructs a Supabase client; every exported function is
// plain-TypeScript typed (no PostgrestError, no raw SupabaseClient, in any
// signature). No threshold/anonymity logic is reimplemented here -- it
// stays entirely in the RPCs, wrapped as-is.
//
// Read-only reference this was wrapped from: src/app/actions/feedback.ts
// (unmodified by this story -- it keeps calling supabase.rpc directly) and
// the two direct-RPC read call sites (dashboard/feedback/[id]/page.tsx,
// dashboard/page.tsx).
//
// Excluded from this domain (per this story's own Intent/Boundaries):
// submitFeedbackResponse/submit_feedback_response and get_responder_context
// (responder/invitation-domain scope, Story 3.19-3.24).
//
// Page-migration follow-up (this file's own extension to finish migrating
// dashboard/feedback/nueva/page.tsx, nueva-360/page.tsx, [id]/page.tsx and
// [id]/gestionar/page.tsx off direct Supabase access -- see the functions
// added below): this now also wraps get_request_competency_comparison/
// get_request_competency_by_category/get_request_saboteadores, previously
// left unclaimed (db/cycles.ts's own header called them "feedback-domain",
// this file's header called them "owned by cyclesManager" -- neither file
// actually wrapped them). They are siblings of getRequestCompetencyNarrative
// above (same requester-only access check, same [id]/page.tsx call site),
// so they land here.

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Matches `create_ad_hoc_feedback_request`'s own check constraint on
 * `p_subtype` (supabase/migrations/0057_feedback_request_name.sql:42). */
export type FeedbackSubtype = "meeting" | "collaboration" | "leadership_initiative" | "general" | "competencias";

export type CompetencyNarrativeRow = {
  questionPosition: number;
  questionPrompt: string;
  competencyCode: string;
  competencyName: string;
  roleCode: string | null;
  mentionCount: number;
  avgValue: number;
  comments: string[];
};

/** Matches `feedback_invitations.evaluator_category`'s own check constraint
 * (supabase/migrations/0001_initial_schema.sql:121,
 * supabase/migrations/0007_360_cycle_flow.sql:16-19). Ad-hoc invitations
 * never set this column, so it is always `null` for rows returned here. */
export type EvaluatorCategory = "self" | "manager" | "team" | "organization" | "other" | null;

export type PendingInvitation = {
  token: string;
  createdAt: string;
  evaluatorCategory: EvaluatorCategory;
  requesterMemberId: string;
  requesterFullName: string | null;
  requesterEmail: string;
  // Story 7.4 (pending-invitations-subtype portion of upstream commit
  // 62e2ed8, supabase/migrations/0074_pending_invitations_request_type.sql
  // + 0075_pending_invitations_subtype.sql): lets dashboard/page.tsx show
  // the real feedback type/subtype ("360" / "por competencias" / ...)
  // instead of an invented generic "ágil" label. `subtype` is only ever
  // set for an `ad_hoc` request -- always `null` for a `cycle` one (the
  // cycles-domain RPC that creates that other request_type never sets it;
  // not named here on purpose -- see this file's own header, Boundaries:
  // db/feedback.ts never even mentions a cycles-domain RPC name).
  requestType: FeedbackRequestType;
  subtype: string | null;
};

// Raw jsonb/row shapes as the RPCs actually return them (snake_case) --
// kept private to this file; callers only ever see the camelCase types above.
type RawCompetencyNarrativeRow = {
  question_position: number;
  question_prompt: string;
  competency_code: string;
  competency_name: string;
  role_code: string | null;
  mention_count: number;
  avg_value: number;
  comments: string[];
};

type RawPendingInvitation = {
  token: string;
  created_at: string;
  evaluator_category: EvaluatorCategory;
  requester_member_id: string;
  requester_full_name: string | null;
  requester_email: string;
  request_type: FeedbackRequestType;
  subtype: string | null;
};

/** Matches `feedback_requests.status`'s own check constraint
 * (supabase/migrations/0001_initial_schema.sql:108). */
export type FeedbackRequestStatus = "open" | "closed";

/** Matches `feedback_requests.request_type`'s own check constraint
 * (supabase/migrations/0001_initial_schema.sql:105). */
export type FeedbackRequestType = "ad_hoc" | "cycle";

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition for dashboard/page.tsx, mi-mapa/page.tsx and
// informe-empresa/page.tsx (spec.md's own AC that those pages should
// compose the existing managers instead of a new dedicated one). Ad_hoc
// half of dashboard/page.tsx's mixed in-progress-requests read (line
// 193-197) -- the cycle-type half is `cyclesManager.getMyCycleRequests()`.
export type AdHocRequestRow = {
  id: string;
  createdAt: string;
  status: FeedbackRequestStatus;
  name: string | null;
  /**
   * `feedback_requests.closes_at` (migration 0050): never set for an
   * ad_hoc request -- only the cycle-lifecycle creation RPCs `cyclesManager`
   * owns populate it (see db/cycles.ts's own module header on this file
   * never referencing those by name) -- so this is always `null` for an
   * ad_hoc row, unlike its cycle counterpart (`CycleRequestRow.closesAt`,
   * db/cycles.ts). Carried through anyway so `feedbackManager`'s merged row
   * shape (Story 7.2) has one consistent field across both request types
   * rather than special-casing ad_hoc.
   */
  closesAt: string | null;
};

type RawAdHocRequestRow = {
  id: string;
  created_at: string;
  status: FeedbackRequestStatus;
  name: string | null;
  closes_at: string | null;
};

export type CompetencyMapRow = {
  competencyCode: string;
  baseValue: number | null;
  mentionDelta: number;
  lastCycleClosedAt: string;
};

type RawCompetencyMapRow = {
  competency_code: string;
  base_value: number | null;
  mention_delta: number;
  last_cycle_closed_at: string;
};

/**
 * Resolves the caller's own `members.id` from the session. Needed only by
 * the direct-table read below -- `feedback_requests`'s own RLS policy is
 * organization-scoped, not per-member (supabase/migrations/
 * 0001_initial_schema.sql:220-223, confirmed by Story 3.25's own
 * characterization test), unlike every RPC this file also wraps, each of
 * which resolves `auth.uid()` itself inside Postgres. Throws the same
 * "not logged in" message the RPCs raise when `caller_member is null`
 * (e.g. get_my_competency_map, supabase/migrations/
 * 0063_fix_competency_map_same_day_mentions.sql:29), for consistency.
 */
async function getCallerMemberId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión.");

  const { data: member, error } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("Debes iniciar sesión.");
  return member.id as string;
}

/** Wraps `create_ad_hoc_feedback_request`. Throws the RPC's own message on failure (e.g. below min-invitees, already has an open request). Returns the new request's id. */
export async function createAdHocFeedbackRequest(
  inviteeMemberIds: string[],
  subtype: FeedbackSubtype = "general",
  name: string | null = null
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_ad_hoc_feedback_request", {
    p_invitee_member_ids: inviteeMemberIds,
    p_subtype: subtype,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Wraps `create_ad_hoc_feedback_request_for_individual`. Throws the RPC's own message on failure (e.g. a malformed email). Returns the new request's id. */
export async function createAdHocFeedbackRequestForIndividual(
  inviteeEmails: string[],
  subtype: FeedbackSubtype = "general",
  name: string | null = null
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_ad_hoc_feedback_request_for_individual", {
    p_invitee_emails: inviteeEmails,
    p_subtype: subtype,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Wraps `cancel_ad_hoc_feedback_request`. Throws the RPC's own message on failure (e.g. already closed, or has responses). */
export async function cancelAdHocFeedbackRequest(requestId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_ad_hoc_feedback_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

/** Wraps `close_ad_hoc_feedback_request`. Throws the RPC's own message on failure (e.g. already closed). No response-count/threshold check exists in this RPC -- it only requires requester-owns-it and status = 'open'. */
export async function closeAdHocFeedbackRequest(requestId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_ad_hoc_feedback_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

/**
 * The one shape both "add evaluators" wrappers below resolve down to --
 * exactly what `responderManager.sendInvitationEmailsForNewInvitees` needs
 * to email just the genuinely-new invitees, never anyone already invited.
 */
export type NewEvaluatorInvite = { email: string; token: string };

/**
 * Wraps `update_ad_hoc_feedback_request_evaluators`. Throws the RPC's own
 * message on failure (e.g. request already has responses). Story 7.7
 * (ports upstream `69f6495`): the RPC's final redefinition (renumbered
 * `0094_fix_ambiguous_returning_column.sql`) is add-only -- `insert ...
 * where not exists (...)`, `returns table (invitee_member_id, token)` of
 * only the newly-inserted rows -- so this now resolves those member ids to
 * emails (a second, small `members` read, same table `getInvitationEmail
 * Context`/`getInviteDetails` already read directly elsewhere in this
 * codebase) and returns them, instead of discarding the RPC's own result as
 * Story 7.6 left it. An id with no matching active member (shouldn't
 * happen -- the RPC itself already validated every id before inserting) is
 * silently dropped rather than emailing an empty address.
 */
export async function updateAdHocFeedbackRequestEvaluators(
  requestId: string,
  inviteeMemberIds: string[]
): Promise<NewEvaluatorInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_ad_hoc_feedback_request_evaluators", {
    p_request_id: requestId,
    p_invitee_member_ids: inviteeMemberIds,
  });
  if (error) throw new Error(error.message);

  const rows = (data as { invitee_member_id: string; token: string }[] | null) || [];
  if (rows.length === 0) return [];

  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, email")
    .in(
      "id",
      rows.map((r) => r.invitee_member_id)
    );
  if (membersError) throw new Error(membersError.message);

  const emailById = new Map((members || []).map((m) => [m.id as string, m.email as string]));
  return rows
    .map((r) => ({ email: emailById.get(r.invitee_member_id) || "", token: r.token }))
    .filter((r) => r.email !== "");
}

/**
 * Wraps `update_ad_hoc_feedback_request_evaluators_for_individual` -- the
 * individual-account counterpart to `updateAdHocFeedbackRequestEvaluators`
 * above (email invitees, not member ids). Same "zero responses required"
 * guard as its sibling. Its final redefinition (renumbered
 * 0094_fix_ambiguous_returning_column.sql) is add-only -- `insert ... where
 * not exists (...)`, same shape as the member-id sibling -- so a "new"
 * email list only ever adds emails not already invited, and this now
 * returns exactly those newly-inserted `{invitee_email, token}` rows
 * (already email-shaped, no `members` lookup needed unlike the sibling
 * above). Story 7.6 left this app-code side unported (feedbackManager.ts
 * was locked by a parallel story at the time); the follow-up commit
 * `5ce2cc3` wired the RPC call but still discarded its result -- Story 7.7
 * (ports upstream `69f6495`) is what actually surfaces it, for the
 * email-only-new-evaluators trigger.
 */
export async function updateAdHocFeedbackRequestEvaluatorsForIndividual(
  requestId: string,
  inviteeEmails: string[]
): Promise<NewEvaluatorInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_ad_hoc_feedback_request_evaluators_for_individual", {
    p_request_id: requestId,
    p_invitee_emails: inviteeEmails,
  });
  if (error) throw new Error(error.message);

  const rows = (data as { invitee_email: string; token: string }[] | null) || [];
  return rows.map((r) => ({ email: r.invitee_email, token: r.token }));
}

/** Wraps `get_request_competency_narrative`. Throws the RPC's own message on failure (e.g. non-requester caller). Returns `[]` when below the reveal threshold -- the RPC's own early-return, no partial content. */
export async function getRequestCompetencyNarrative(requestId: string): Promise<CompetencyNarrativeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_request_competency_narrative", { p_request_id: requestId });
  if (error) throw new Error(error.message);

  const rows = (data as RawCompetencyNarrativeRow[] | null) || [];
  return rows.map((row) => ({
    questionPosition: row.question_position,
    questionPrompt: row.question_prompt,
    competencyCode: row.competency_code,
    competencyName: row.competency_name,
    roleCode: row.role_code,
    mentionCount: row.mention_count,
    avgValue: row.avg_value,
    comments: row.comments,
  }));
}

/** Wraps `get_my_pending_invitations`. No params, caller-scoped; throws the RPC's own message on failure (e.g. not logged in). */
export async function getMyPendingInvitations(): Promise<PendingInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_pending_invitations");
  if (error) throw new Error(error.message);

  const rows = (data as RawPendingInvitation[] | null) || [];
  return rows.map((row) => ({
    token: row.token,
    createdAt: row.created_at,
    evaluatorCategory: row.evaluator_category,
    requesterMemberId: row.requester_member_id,
    requesterFullName: row.requester_full_name,
    requesterEmail: row.requester_email,
    requestType: row.request_type,
    subtype: row.subtype,
  }));
}

/**
 * Wraps the ad_hoc-only slice of `dashboard/page.tsx`'s mixed
 * in-progress-requests read (line 193-197: `feedback_requests` filtered to
 * `requester_member_id` and ordered `created_at desc`) -- direct table
 * read, no RPC exists for this (Story 3.25's own confirmed finding). Only
 * `request_type = 'ad_hoc'` rows; the `'cycle'` half is
 * `cyclesManager.getMyCycleRequests()` (see this story's own Intent for
 * why the split happens at the manager boundary). No params, caller-scoped
 * by `getCallerMemberId` above.
 */
export async function getMyAdHocRequests(): Promise<AdHocRequestRow[]> {
  const supabase = await createClient();
  const memberId = await getCallerMemberId(supabase);

  const { data, error } = await supabase
    .from("feedback_requests")
    .select("id, created_at, status, name, closes_at")
    .eq("requester_member_id", memberId)
    .eq("request_type", "ad_hoc")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data as RawAdHocRequestRow[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    name: row.name,
    closesAt: row.closes_at,
  }));
}

/**
 * Wraps `get_my_competency_map` (mi-mapa/page.tsx line 42). No params,
 * caller-scoped internally by the RPC. Returns `[]` when the caller has
 * never closed a 360 (the RPC's own early return) -- irreducibly composite
 * (mixes a closed-cycle `base_value` with an ad_hoc `mention_delta` in one
 * PL/pgSQL query), not reimplemented client-side, per this story's own
 * Boundaries.
 */
export async function getMyCompetencyMap(): Promise<CompetencyMapRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_competency_map");
  if (error) throw new Error(error.message);

  const rows = (data as RawCompetencyMapRow[] | null) || [];
  return rows.map((row) => ({
    competencyCode: row.competency_code,
    baseValue: row.base_value,
    mentionDelta: row.mention_delta,
    lastCycleClosedAt: row.last_cycle_closed_at,
  }));
}

// ---------------------------------------------------------------------------
// Page-migration follow-up (see this file's header): the direct-table/RPC
// reads dashboard/feedback/nueva/page.tsx, nueva-360/page.tsx, [id]/page.tsx
// and [id]/gestionar/page.tsx made inline before this extension. Every
// function below throws on `error` unconditionally, same as every other
// function in this file -- even though most of these call sites' original
// inline code destructured only `data` and silently ignored `error`. That
// silent-ignore was never reachable in practice: every one of these reads
// runs after the calling page has already confirmed (via getCurrentUser/
// getCurrentMember, or via the request-ownership check on
// getFeedbackRequestById's own result) that the caller is allowed to be
// here, so an RPC/RLS error at this point would mean something is
// genuinely broken, not a routine "not yours" case -- same reasoning
// getRequestCompetencyNarrative above already established for this file.
// ---------------------------------------------------------------------------

/**
 * Wraps the "do I already have an open request of this type" existence
 * check duplicated in nueva/page.tsx (request_type = 'ad_hoc') and
 * nueva-360/page.tsx (request_type = 'cycle') -- direct table read, no RPC
 * exists for this. Takes the caller's own `members.id` as a parameter
 * rather than resolving it internally, since every caller of this function
 * already has it in hand from `membersManager.getCurrentMember()`.
 */
export async function getMyOpenRequestId(
  requesterMemberId: string,
  requestType: FeedbackRequestType
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("requester_member_id", requesterMemberId)
    .eq("request_type", requestType)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * Wraps the `platform_settings.min_invitees_per_request` read duplicated
 * across nueva/page.tsx, nueva-360/page.tsx, [id]/page.tsx and
 * [id]/gestionar/page.tsx -- direct table read, no RPC exists for this.
 * Returns `null` when the org has no row -- deliberately left unresolved
 * here (no default applied in this file): `feedbackManager.
 * getMinInviteesPerRequest` is the one place that now applies the `?? 5`
 * fallback (previously duplicated at each of those 4 call sites), so this
 * db-layer function stays a plain, honest reflection of the row.
 */
export async function getMinInviteesPerRequest(organizationId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.min_invitees_per_request ?? null;
}

/**
 * Wraps the `platform_texts` read that used to live in the now-deleted
 * `src/lib/platformTexts.ts` (a standalone helper taking a raw
 * `SupabaseClient` parameter -- removed once this became its only caller's
 * migration target and lost its last real importer). nueva-360/page.tsx is
 * the only caller; it can no longer hold a raw Supabase client to pass in.
 * Same fallback-on-missing-row behavior as that helper had (the key not
 * existing yet, e.g. an unapplied migration, falls back instead of
 * breaking the page).
 */
export async function getPlatformText(key: string, fallback: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_texts").select("content").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.content || fallback;
}

export type EvaluatorCandidate = {
  id: string;
  email: string;
  fullName: string | null;
};

type RawEvaluatorCandidate = {
  id: string;
  email: string;
  full_name: string | null;
};

/**
 * Wraps the "active, non-supervisor, not-me" members list duplicated
 * across nueva/page.tsx, [id]/page.tsx and [id]/gestionar/page.tsx for
 * evaluator selection -- direct table read, no RPC exists for this. Not
 * the same query as `cyclesManager.getColleaguesWithClosedCycle()` -- that
 * one wraps a cycle-lifecycle RPC scoped to colleagues who already have a
 * closed 360 (deliberately not named here by its RPC string; see Section 2
 * of tests/integration/feedback-new-path-verification.test.ts, which
 * statically asserts this file's own source never contains any
 * cycles-domain RPC name, AD-3's ad-hoc-vs-cycle ownership split);
 * confirmed by reading both call sites before assuming they matched.
 * Also not `membersManager.listMembers()` -- that wraps
 * `list_organization_members`, which is platform-admin-only
 * (supabase/migrations/0020_remove_manager_role.sql:106,
 * `is_platform_admin()` check), unusable by an ordinary member picking
 * evaluators.
 */
export async function getEvaluatorCandidates(excludeMemberId: string): Promise<EvaluatorCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .eq("is_supervisor", false)
    .neq("id", excludeMemberId)
    .order("email");
  if (error) throw new Error(error.message);

  const rows = (data as RawEvaluatorCandidate[] | null) || [];
  return rows.map((row) => ({ id: row.id, email: row.email, fullName: row.full_name }));
}

export type FeedbackRequestDetail = {
  id: string;
  createdAt: string;
  requesterMemberId: string;
  requestType: FeedbackRequestType;
  status: FeedbackRequestStatus;
  closesAt: string | null;
  name: string | null;
  cycleName: string | null;
  aiInterpretation: string | null;
};

type RawFeedbackRequestDetail = {
  id: string;
  created_at: string;
  requester_member_id: string;
  request_type: FeedbackRequestType;
  status: FeedbackRequestStatus;
  closes_at: string | null;
  name: string | null;
  feedback_cycles: { name: string } | null;
  ai_interpretation: string | null;
};

/**
 * Wraps the `feedback_requests` by-id lookup duplicated (with two
 * different, narrower column lists) across [id]/page.tsx and
 * [id]/gestionar/page.tsx -- direct table read, no RPC exists for this.
 * Superset-selected (same "one list, multiple consumers" precedent as
 * `cyclesManager.getMyCycleRequests()`/`membersManager.getCurrentMember()`)
 * so both call sites share one function instead of two near-duplicate
 * reads. `feedback_requests`'s own RLS policy is organization-scoped, not
 * per-member/per-requester (see this file's own `getCallerMemberId` doc
 * comment) -- a row from another member's request in the same org is
 * still visible here; callers are responsible for their own
 * `requesterMemberId !== currentMember.id` ownership check afterwards,
 * exactly as both pages already do today. Returns `null` when no row is
 * visible (not found, or a different org) -- callers redirect on that,
 * same as today.
 */
export async function getFeedbackRequestById(id: string): Promise<FeedbackRequestDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_requests")
    .select(
      "id, created_at, requester_member_id, request_type, status, closes_at, name, feedback_cycles(name), ai_interpretation"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as RawFeedbackRequestDetail;
  return {
    id: row.id,
    createdAt: row.created_at,
    requesterMemberId: row.requester_member_id,
    requestType: row.request_type,
    status: row.status,
    closesAt: row.closes_at,
    name: row.name,
    cycleName: row.feedback_cycles?.name ?? null,
    aiInterpretation: row.ai_interpretation,
  };
}

export type FeedbackRequestProgress = {
  responseCount: number;
  threshold: number;
  revealed: boolean;
  selfResponded: boolean;
};

type RawFeedbackRequestProgress = {
  response_count: number;
  threshold: number;
  revealed: boolean;
  self_responded: boolean;
};

/**
 * Wraps `get_feedback_request_progress`, used by both [id]/page.tsx and
 * [id]/gestionar/page.tsx. `.maybeSingle()` mirrors both call sites'
 * existing usage -- the RPC always returns exactly one row for a valid
 * request id (it raises instead of returning zero rows for a bad id, see
 * supabase/migrations/0049_cycle_reveal_requires_self.sql:31-33), so `null`
 * here is unreachable in practice, same as `.maybeSingle()` elsewhere in
 * this file.
 */
export async function getFeedbackRequestProgress(requestId: string): Promise<FeedbackRequestProgress | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_feedback_request_progress", { p_request_id: requestId })
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as RawFeedbackRequestProgress;
  return {
    responseCount: row.response_count,
    threshold: row.threshold,
    revealed: row.revealed,
    selfResponded: row.self_responded,
  };
}

/**
 * Wraps [id]/page.tsx's `feedback_invitations` exact-count read (`{count:
 * "exact", head: true}`) -- direct table read, no RPC exists for this.
 * Returns 0 rather than null on a technically-possible-but-unreachable
 * null count (Postgrest only omits count on error, which throws above
 * instead).
 */
export async function getFeedbackInvitationsCount(requestId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("feedback_invitations")
    .select("id", { count: "exact", head: true })
    .eq("feedback_request_id", requestId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Wraps [id]/page.tsx's `canManage` invitee-id read (no evaluator_category
 * filter -- unlike [id]/gestionar/page.tsx's org-account read below, this
 * one is only ever reached for an open ad_hoc request, whose invitations
 * never set evaluator_category, see this file's own `EvaluatorCategory`
 * doc comment). Direct table read, no RPC exists for this. Filters out
 * null invitee_member_id, same as the page's own `.filter((v): v is
 * string => Boolean(v))` today.
 */
export async function getFeedbackRequestInviteeMemberIds(requestId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_invitations")
    .select("invitee_member_id")
    .eq("feedback_request_id", requestId);
  if (error) throw new Error(error.message);

  return ((data as { invitee_member_id: string | null }[] | null) || [])
    .map((row) => row.invitee_member_id)
    .filter((v): v is string => Boolean(v));
}

export type FeedbackRequestMemberInvitation = {
  memberId: string;
  evaluatorCategory: EvaluatorCategory;
};

/**
 * Wraps [id]/gestionar/page.tsx's org-account invitee read (member-id
 * invitations, excluding the requester's own self-assessment invitation
 * via the `evaluator_category.is.null,evaluator_category.neq.self` OR
 * filter) -- direct table read, no RPC exists for this. Filters out null
 * invitee_member_id, same as the page's own filter today.
 */
export async function getFeedbackRequestMemberInvitations(
  requestId: string
): Promise<FeedbackRequestMemberInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_invitations")
    .select("invitee_member_id, evaluator_category")
    .eq("feedback_request_id", requestId)
    .or("evaluator_category.is.null,evaluator_category.neq.self");
  if (error) throw new Error(error.message);

  return ((data as { invitee_member_id: string | null; evaluator_category: EvaluatorCategory }[] | null) || [])
    .filter((row): row is { invitee_member_id: string; evaluator_category: EvaluatorCategory } =>
      Boolean(row.invitee_member_id)
    )
    .map((row) => ({ memberId: row.invitee_member_id, evaluatorCategory: row.evaluator_category }));
}

export type FeedbackRequestEmailInvitation = {
  email: string;
  evaluatorCategory: EvaluatorCategory;
};

/**
 * Wraps [id]/gestionar/page.tsx's individual-account invitee read
 * (email invitations, `invitee_email is not null`) -- direct table read,
 * no RPC exists for this. Filters out null invitee_email, same as the
 * page's own filter today.
 */
export async function getFeedbackRequestEmailInvitations(
  requestId: string
): Promise<FeedbackRequestEmailInvitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_invitations")
    .select("invitee_email, evaluator_category")
    .eq("feedback_request_id", requestId)
    .not("invitee_email", "is", null);
  if (error) throw new Error(error.message);

  return ((data as { invitee_email: string | null; evaluator_category: EvaluatorCategory }[] | null) || [])
    .filter((row): row is { invitee_email: string; evaluator_category: EvaluatorCategory } =>
      Boolean(row.invitee_email)
    )
    .map((row) => ({ email: row.invitee_email, evaluatorCategory: row.evaluator_category }));
}

export type CompetencyComparisonRow = {
  competencyCode: string;
  competencyName: string;
  principleCode: string | null;
  principleName: string | null;
  roleCode: string | null;
  roleName: string | null;
  selfValue: number | null;
  peerAvgValue: number | null;
  peerResponseCount: number;
};

type RawCompetencyComparisonRow = {
  competency_code: string;
  competency_name: string;
  principle_code: string | null;
  principle_name: string | null;
  role_code: string | null;
  role_name: string | null;
  self_value: number | null;
  peer_avg_value: number | null;
  peer_response_count: number;
};

/**
 * Wraps `get_request_competency_comparison` (self-vs-peer comparison, only
 * meaningful for a cycle/360 request -- see this file's own header for why
 * this landed here rather than in `cyclesManager`). Throws the RPC's own
 * message on failure (e.g. non-requester caller). Returns `[]` when below
 * the reveal threshold -- the RPC's own early-return, no partial content,
 * same as `getRequestCompetencyNarrative` above.
 */
export async function getRequestCompetencyComparison(requestId: string): Promise<CompetencyComparisonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_request_competency_comparison", { p_request_id: requestId });
  if (error) throw new Error(error.message);

  const rows = (data as RawCompetencyComparisonRow[] | null) || [];
  return rows.map((row) => ({
    competencyCode: row.competency_code,
    competencyName: row.competency_name,
    principleCode: row.principle_code,
    principleName: row.principle_name,
    roleCode: row.role_code,
    roleName: row.role_name,
    selfValue: row.self_value,
    peerAvgValue: row.peer_avg_value,
    peerResponseCount: row.peer_response_count,
  }));
}

export type CompetencyByCategoryRow = {
  competencyCode: string;
  evaluatorCategory: string;
  avgValue: number;
  responseCount: number;
};

type RawCompetencyByCategoryRow = {
  competency_code: string;
  evaluator_category: string;
  avg_value: number;
  response_count: number;
};

/**
 * Wraps `get_request_competency_by_category` (per-evaluator-category
 * breakdown, only meaningful for a cycle/360 request). Throws the RPC's
 * own message on failure (e.g. non-requester caller). A category only
 * appears here once it has met its own minimum-responses threshold -- the
 * RPC's own filtering, not reimplemented client-side.
 */
export async function getRequestCompetencyByCategory(requestId: string): Promise<CompetencyByCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_request_competency_by_category", { p_request_id: requestId });
  if (error) throw new Error(error.message);

  const rows = (data as RawCompetencyByCategoryRow[] | null) || [];
  return rows.map((row) => ({
    competencyCode: row.competency_code,
    evaluatorCategory: row.evaluator_category,
    avgValue: row.avg_value,
    responseCount: row.response_count,
  }));
}

export type SaboteadorRow = {
  saboteadorCode: string;
  avgValue: number;
  isHigh: boolean;
};

type RawSaboteadorRow = {
  saboteador_code: string;
  avg_value: number;
  is_high: boolean;
};

/**
 * Wraps `get_request_saboteadores` (self-assessment-only, only meaningful
 * for a cycle/360 request). Throws the RPC's own message on failure (e.g.
 * non-requester caller).
 */
export async function getRequestSaboteadores(requestId: string): Promise<SaboteadorRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_request_saboteadores", { p_request_id: requestId });
  if (error) throw new Error(error.message);

  const rows = (data as RawSaboteadorRow[] | null) || [];
  return rows.map((row) => ({
    saboteadorCode: row.saboteador_code,
    avgValue: row.avg_value,
    isHigh: row.is_high,
  }));
}

export type FeedbackAnswerRow = {
  answerText: string | null;
  answerValue: number | null;
  questionPrompt: string | null;
  questionPosition: number | null;
  questionType: string | null;
};

type RawFeedbackAnswerRow = {
  answer_text: string | null;
  answer_value: number | null;
  survey_questions: { prompt: string; position: number; question_type: string } | null;
};

/**
 * Wraps [id]/page.tsx's `feedback_answers` join read (joined through
 * `feedback_responses!inner` to filter by request id and self/peer) --
 * direct table read, no RPC exists for this. Returns the raw joined rows
 * typed/flattened only -- the page's own grouping-by-prompt logic
 * (`loadQuestionGroups`) stays in the page, unchanged, same as this
 * story's "no threshold/anonymity logic reimplemented here" rule for the
 * rest of this file.
 */
export async function getFeedbackRequestAnswers(requestId: string, isSelf: boolean): Promise<FeedbackAnswerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_answers")
    .select(
      "answer_text, answer_value, survey_questions(prompt, position, question_type), feedback_responses!inner(feedback_request_id, is_self)"
    )
    .eq("feedback_responses.feedback_request_id", requestId)
    .eq("feedback_responses.is_self", isSelf);
  if (error) throw new Error(error.message);

  const rows = (data as unknown as RawFeedbackAnswerRow[] | null) || [];
  return rows.map((row) => ({
    answerText: row.answer_text,
    answerValue: row.answer_value,
    questionPrompt: row.survey_questions?.prompt ?? null,
    questionPosition: row.survey_questions?.position ?? null,
    questionType: row.survey_questions?.question_type ?? null,
  }));
}
