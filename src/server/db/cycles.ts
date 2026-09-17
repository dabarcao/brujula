// Story 3.8 (_bmad-output/implementation-artifacts/
// spec-3-8-db-access-manager-scaffolding-cycles.md): db-access layer for
// the cycles domain (spec.md sección 4.1). Thin, typed wrappers around the
// 8 in-scope cycle-lifecycle RPCs, mirroring Story 1.2's
// src/server/db/reportGroups.ts / Story 3.2's src/server/db/admin.ts shape
// exactly -- this file is deliberately the only new code for this domain
// that constructs a Supabase client; every exported function is plain-
// TypeScript typed (no PostgrestError, no raw SupabaseClient, in any
// signature).
//
// Read-only reference this was wrapped from: src/app/actions/cycles.ts
// (unmodified by this story -- it keeps calling supabase.rpc directly until
// Story 3.10 refactors it to delegate here).
//
// Excluded from this domain (per this story's own Intent): get_request_
// competency_comparison (feedback-domain, Story 3.14) and the ad-hoc-
// feedback RPCs (feedbackManager's, per AD-3's shared-table split).

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CycleParticipantCategory = "manager" | "team" | "organization" | "other";

export type CycleStatusRow = {
  memberId: string;
  fullName: string | null;
  email: string;
  status: "no_iniciado" | "en_progreso" | "completado";
};

export type ColleagueWithClosedCycle = {
  id: string;
  email: string;
  fullName: string | null;
};

// Raw jsonb/row shapes as the RPCs actually return them (snake_case) --
// kept private to this file; callers only ever see the camelCase types above.
type RawCycleStatusRow = {
  member_id: string;
  full_name: string | null;
  email: string;
  status: "no_iniciado" | "en_progreso" | "completado";
};

type RawColleagueWithClosedCycle = {
  id: string;
  email: string;
  full_name: string | null;
};

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition for dashboard/page.tsx (spec.md's own AC that it should
// compose the existing managers instead of a new dedicated one). Cycle
// half of dashboard/page.tsx's mixed in-progress-requests read (lines
// 193-197) -- the ad_hoc-type half is `feedbackManager.getMyAdHocRequests()`
// -- plus the open-company-cycles join (lines 204-207). Superset-selected
// (id/cycleId/createdAt/status/cycleName) so `getMyCycleRequests` alone
// serves both the page's own list AND its cycle-request dedup read (lines
// 225-229, which only needs id/cycleId) -- this story's own investigated
// scope correction; splitting further would just re-run the identical
// query twice.
export type CycleRequestRow = {
  id: string;
  cycleId: string | null;
  createdAt: string;
  status: "open" | "closed";
  cycleName: string | null;
  /**
   * `feedback_requests.closes_at` (migration 0050): for a cycle request,
   * always set -- either chosen by the person at creation (individual 360)
   * or copied from the company cycle's own `closes_at` at
   * `organize_cycle_evaluators` time. Story 7.2: dashboard/page.tsx's
   * "Mis feedbacks cerrados" section surfaces this as the request's real
   * close date.
   */
  closesAt: string | null;
};

type RawCycleRequestRow = {
  id: string;
  cycle_id: string | null;
  created_at: string;
  status: "open" | "closed";
  closes_at: string | null;
  feedback_cycles: { name: string } | null;
};

export type OpenCycleRow = {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
};

type RawOpenCycleRow = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
};

// Story 6.4 (cycles-domain migration): types for the direct-table reads
// wrapped below, added to close out this domain's remaining
// eslint.config.mjs exemptions (dashboard/cycles/page.tsx, nueva/page.tsx,
// [id]/page.tsx, [id]/estado/page.tsx, actions/cycles.ts).

export type OrgCycleRow = {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  requestStatuses: string[];
  /**
   * Computed here (not by the caller): true once every one of this cycle's
   * requests has status "closed" (and there's at least one). Mirrors
   * `getCycleStatus`'s own "compute it once, close to the data" precedent --
   * see this field's own call site below for the exact rule moved out of
   * dashboard/cycles/page.tsx's old `isCycleClosed` helper.
   */
  isClosed: boolean;
};

type RawOrgCycleRow = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  feedback_requests: { status: string }[];
};

export type CycleRow = {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  /**
   * Computed here (not by the caller): true iff today falls within
   * [opensAt, closesAt] (inclusive), ISO date-string comparison. Moved out
   * of cycles/[id]/page.tsx's old inline `isOpen` computation -- see this
   * field's own call site below.
   */
  isOpen: boolean;
};

type RawCycleRow = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
};

export type ColleagueOption = {
  id: string;
  email: string;
  fullName: string | null;
};

type RawColleagueOption = {
  id: string;
  email: string;
  full_name: string | null;
};

/**
 * Resolves the caller's own `members.id` from the session. Needed only by
 * this file's two direct-table reads below -- `feedback_requests`'s own
 * RLS policy is organization-scoped, not per-member (supabase/migrations/
 * 0001_initial_schema.sql:220-223, confirmed by Story 3.25's own
 * characterization test), and while `feedback_cycle_participants`'s own
 * policy IS per-member (0017_supervisor_and_admin_management.sql:194-196),
 * dashboard/page.tsx's own query still passes an explicit `member_id`
 * filter alongside it (belt-and-suspenders, not a workaround) -- mirrored
 * here for the same equivalence this story requires. Throws the same "not
 * logged in" message the RPCs in this file raise for an absent caller.
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

/** Wraps `create_feedback_cycle`. Throws the RPC's own message on failure (e.g. a participant already has an open cycle). Returns the new cycle's id. */
export async function createFeedbackCycle(
  name: string,
  opensAt: string,
  closesAt: string,
  participantMemberIds: string[]
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_feedback_cycle", {
    p_name: name,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_participant_member_ids: participantMemberIds,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Wraps `close_cycle_request` -- only that RPC, no AI-interpretation
 * orchestration here (see this story's own Boundaries: finalizeCycleRequest's
 * generateAiInterpretation helper is cross-domain and not migrated by this
 * story). Throws the RPC's own message on failure (e.g. below the reveal
 * threshold).
 */
export async function closeCycleRequest(requestId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cycle_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

/**
 * Wraps `organize_cycle_evaluators`. Throws the RPC's own message on
 * failure (e.g. already organized for this cycle). Returns the new cycle
 * request's id -- confirmed via the RPC's own source
 * (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql:124,
 * `return new_request_id`), not `void` as this story's own Code Map states;
 * see Implementation Notes for this investigated correction.
 */
export async function organizeCycleEvaluators(
  cycleId: string,
  evaluatorMemberIds: string[],
  evaluatorCategories: CycleParticipantCategory[]
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organize_cycle_evaluators", {
    p_cycle_id: cycleId,
    p_evaluator_member_ids: evaluatorMemberIds,
    p_evaluator_categories: evaluatorCategories,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Wraps `create_individual_cycle_request`. Throws the RPC's own message on failure (e.g. a malformed email). Returns the new request's id. */
export async function createIndividualCycleRequest(
  evaluatorEmails: string[],
  evaluatorCategories: CycleParticipantCategory[],
  closesAt: string,
  name: string | null
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_individual_cycle_request", {
    p_evaluator_emails: evaluatorEmails,
    p_evaluator_categories: evaluatorCategories,
    p_closes_at: closesAt,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * The one shape both "add evaluators" wrappers below resolve down to --
 * exactly what `responderManager.sendInvitationEmailsForNewInvitees` needs
 * to email just the genuinely-new invitees, never anyone already invited.
 * A same-shape sibling of `db/feedback.ts`'s own `NewEvaluatorInvite`, kept
 * as its own local type rather than a cross-domain import -- this file has
 * never imported from `db/feedback.ts` (each db/*.ts file is self-contained,
 * see this file's own header comment), and the type itself is trivial.
 */
export type NewEvaluatorInvite = { email: string; token: string };

/**
 * Wraps `update_cycle_request_evaluators`. Throws the RPC's own message on
 * failure (e.g. request already closed). Story 7.7 (ports upstream
 * `69f6495`): the RPC's final redefinition (renumbered
 * `0094_fix_ambiguous_returning_column.sql`) is add-only -- `insert ...
 * where not exists (...)`, `returns table (invitee_member_id, token)` of
 * only the newly-inserted rows, same shape as `db/feedback.ts`'s ad-hoc
 * sibling -- so this resolves those member ids to emails and returns them,
 * instead of discarding the RPC's own result as before.
 */
export async function updateCycleRequestEvaluators(
  requestId: string,
  evaluatorMemberIds: string[],
  evaluatorCategories: CycleParticipantCategory[]
): Promise<NewEvaluatorInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_cycle_request_evaluators", {
    p_request_id: requestId,
    p_evaluator_member_ids: evaluatorMemberIds,
    p_evaluator_categories: evaluatorCategories,
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
 * Wraps `update_individual_cycle_request_evaluators`. Throws the RPC's own
 * message on failure (e.g. inviting self). Story 7.7: same add-only final
 * redefinition as its member-id sibling above, `returns table
 * (invitee_email, token)` -- already email-shaped, no `members` lookup
 * needed -- so this now returns those newly-inserted rows instead of
 * discarding them.
 */
export async function updateIndividualCycleRequestEvaluators(
  requestId: string,
  evaluatorEmails: string[],
  evaluatorCategories: CycleParticipantCategory[]
): Promise<NewEvaluatorInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_individual_cycle_request_evaluators", {
    p_request_id: requestId,
    p_evaluator_emails: evaluatorEmails,
    p_evaluator_categories: evaluatorCategories,
  });
  if (error) throw new Error(error.message);

  const rows = (data as { invitee_email: string; token: string }[] | null) || [];
  return rows.map((r) => ({ email: r.invitee_email, token: r.token }));
}

/** Wraps `get_cycle_status`. Throws the RPC's own message on failure (e.g. non-Supervisor caller). */
export async function getCycleStatus(cycleId: string): Promise<CycleStatusRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cycle_status", { p_cycle_id: cycleId });
  if (error) throw new Error(error.message);

  const rows = (data as RawCycleStatusRow[] | null) || [];
  return rows.map((row) => ({
    memberId: row.member_id,
    fullName: row.full_name,
    email: row.email,
    status: row.status,
  }));
}

/** Wraps `get_colleagues_with_closed_cycle`. No params, caller-scoped; throws the RPC's own message on failure (e.g. not logged in). */
export async function getColleaguesWithClosedCycle(): Promise<ColleagueWithClosedCycle[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_colleagues_with_closed_cycle");
  if (error) throw new Error(error.message);

  const rows = (data as RawColleagueWithClosedCycle[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
  }));
}

/**
 * Wraps the cycle-type slice of `dashboard/page.tsx`'s mixed
 * in-progress-requests read (feedback_requests, `request_type = 'cycle'`
 * only) -- direct table read, no RPC exists for this (Story 3.25's own
 * confirmed finding). Superset-selected: serves both the page's own list
 * (createdAt/status/cycleName) and its cycle-request dedup map (cycleId),
 * see this file's own header comment. No params, caller-scoped by
 * `getCallerMemberId` above.
 */
export async function getMyCycleRequests(): Promise<CycleRequestRow[]> {
  const supabase = await createClient();
  const memberId = await getCallerMemberId(supabase);

  const { data, error } = await supabase
    .from("feedback_requests")
    .select("id, cycle_id, created_at, status, closes_at, feedback_cycles(name)")
    .eq("requester_member_id", memberId)
    .eq("request_type", "cycle")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data as unknown as RawCycleRequestRow[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    cycleId: row.cycle_id,
    createdAt: row.created_at,
    status: row.status,
    cycleName: row.feedback_cycles?.name ?? null,
    closesAt: row.closes_at,
  }));
}

/**
 * Wraps dashboard/page.tsx's own open-company-cycles join (lines 204-207:
 * `feedback_cycle_participants` joined to `feedback_cycles`) -- direct
 * table read, no RPC exists for this.
 *
 * Cycles-domain audit fix (business logic belongs at this layer, not the
 * page): this function's own name says "open cycles", so it now actually
 * filters to currently-open ones here (today between opens_at and
 * closes_at inclusive, ISO date-string comparison) instead of returning
 * every cycle the caller participates in regardless of date and leaving
 * that filter to be recomputed by each caller (dashboard/page.tsx's own
 * `.filter((cycle) => cycle.opens_at <= today && today <= cycle.closes_at)`,
 * lines 220, is a duplicate of cycles/[id]/page.tsx's now-removed inline
 * `isOpen` check -- see `getCycleById`'s own `isOpen` field below for that
 * half of the fix). dashboard/page.tsx itself is unmodified: its own
 * date filter now runs redundantly over an already-filtered list, which is
 * a no-op, not a behavior change; a future story can drop that
 * now-redundant filter there. The opens_at-ascending sort stays
 * page-level (dashboard/page.tsx:221), untouched -- only the date-range
 * predicate was business logic, sorting isn't. No params, caller-scoped
 * by `getCallerMemberId` above.
 */
export async function getMyOpenCycles(): Promise<OpenCycleRow[]> {
  const supabase = await createClient();
  const memberId = await getCallerMemberId(supabase);

  const { data, error } = await supabase
    .from("feedback_cycle_participants")
    .select("feedback_cycles(id, name, opens_at, closes_at)")
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data as unknown as { feedback_cycles: RawOpenCycleRow | null }[] | null) || [];
  return rows
    .map((row) => row.feedback_cycles)
    .filter((cycle): cycle is RawOpenCycleRow => Boolean(cycle))
    .filter((cycle) => cycle.opens_at <= today && today <= cycle.closes_at)
    .map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      opensAt: cycle.opens_at,
      closesAt: cycle.closes_at,
    }));
}

// ---------------------------------------------------------------------------
// Story 6.4 (cycles-domain migration): wraps the remaining direct
// supabase.from/.rpc calls found in dashboard/cycles/page.tsx, nueva/
// page.tsx, [id]/page.tsx, [id]/estado/page.tsx and actions/cycles.ts --
// closing out this domain's eslint.config.mjs exemptions. Each function
// below mirrors one page's own query exactly (same filters, same
// maybeSingle()/error-handling shape), per this story's "preserve exact
// existing behavior" boundary -- no new business logic added.
// ---------------------------------------------------------------------------

/**
 * Wraps dashboard/cycles/page.tsx's own Supervisor cycles-list query
 * (`feedback_cycles` joined to `feedback_requests(status)`, organization-
 * scoped, opens_at-descending). Throws on query error, same
 * `if (error) throw new Error(error.message)` shape as every other
 * function in this file -- same precedent as `getMyCycleRequests`/
 * `getMyOpenCycles` above, whose own page (dashboard/page.tsx) likewise
 * never checked this query's error itself.
 *
 * Cycles-domain audit fix: the open/closed split (formerly the page's own
 * `isCycleClosed` helper) is business logic, not rendering -- computed
 * here now as `isClosed` (see `OrgCycleRow`'s own doc comment), same
 * "compute it once, close to the data" pattern `getCycleStatus`'s
 * `status` field already established. `requestStatuses` is still returned
 * alongside it (not removed) -- nothing else needs the raw array, but
 * dropping it isn't this fix's job.
 */
export async function listOrganizationCycles(organizationId: string): Promise<OrgCycleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_cycles")
    .select("id, name, opens_at, closes_at, feedback_requests(status)")
    .eq("organization_id", organizationId)
    .order("opens_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data as unknown as RawOrgCycleRow[] | null) || [];
  return rows.map((row) => {
    const requestStatuses = (row.feedback_requests || []).map((r) => r.status);
    return {
      id: row.id,
      name: row.name,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      requestStatuses,
      isClosed: requestStatuses.length > 0 && requestStatuses.every((status) => status === "closed"),
    };
  });
}

/**
 * Wraps the single-cycle-by-id lookup shared identically by
 * [id]/page.tsx and [id]/estado/page.tsx (`feedback_cycles` id/name/
 * opens_at/closes_at, `.maybeSingle()`). Org-scoping is left to RLS
 * ("feedback_cycles scoped to organization",
 * supabase/migrations/0001_initial_schema.sql:215-217), same as both
 * pages' own unfiltered-by-org query. Returns `null` for "not found"
 * (both callers redirect on that), matching `.maybeSingle()`'s own
 * behavior; throws on any other query error.
 *
 * Cycles-domain audit fix: also returns `isOpen` (see `CycleRow`'s own
 * doc comment) -- the same today-between-opens_at-and-closes_at rule
 * cycles/[id]/page.tsx used to compute inline, moved here so it's
 * computed once, close to the data, instead of recomputed by each caller.
 */
export async function getCycleById(cycleId: string): Promise<CycleRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_cycles")
    .select("id, name, opens_at, closes_at")
    .eq("id", cycleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as RawCycleRow;
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    name: row.name,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isOpen: row.opens_at <= today && today <= row.closes_at,
  };
}

/**
 * Wraps [id]/page.tsx's own `feedback_cycle_participants` membership
 * check (`.eq("cycle_id", ...).eq("member_id", ...).maybeSingle()`,
 * `Boolean(participation)`). RLS on this table is already per-member
 * (0017_supervisor_and_admin_management.sql:194-196), so the explicit
 * `memberId` filter here is belt-and-suspenders, same as
 * `getCallerMemberId`'s own doc comment above. Throws on query error.
 */
export async function isCycleParticipant(cycleId: string, memberId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_cycle_participants")
    .select("cycle_id")
    .eq("cycle_id", cycleId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Wraps [id]/page.tsx's own existing-cycle-request check
 * (`feedback_requests`, `.eq("cycle_id", ...).eq("requester_member_id",
 * ...).maybeSingle()`). Returns just the request id (all the page reads
 * off the row) or `null` if the caller hasn't organized evaluators for
 * this cycle yet. Throws on query error.
 */
export async function getExistingCycleRequestId(
  cycleId: string,
  requesterMemberId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("requester_member_id", requesterMemberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Wraps nueva/page.tsx's own participant-picker colleagues query: active
 * members, excluding the caller, no `is_supervisor` filter (any active
 * colleague can be picked as a cycle participant). Distinct from
 * `listEvaluatorCandidates` below, which [id]/page.tsx's evaluator picker
 * uses and DOES filter out supervisors -- confirmed these are two
 * different queries in the original pages, not the same one reused (per
 * this story's own investigation note), so kept as two functions rather
 * than one parameterized call, mirroring this file's existing
 * one-function-per-distinct-read convention (e.g. `getMyCycleRequests`
 * vs. `getMyOpenCycles`). Org-scoping is left to RLS ("members see
 * colleagues in same organization"), same as the original query. Throws
 * on query error.
 *
 * Story 7.4: excludes Invitado members -- an Invitado can never be the
 * subject of a company 360 cycle (never evaluated, only evaluates), so
 * they must never even appear as a pickable participant here. Backstopped
 * by `create_feedback_cycle`'s own `or m.is_guest` rejection
 * (supabase/migrations/0076_guest_member_type.sql), this is the frontend
 * picker matching that same rule so a guest is never offered in the first
 * place.
 */
export async function listCycleParticipantCandidates(excludeMemberId: string): Promise<ColleagueOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .eq("is_guest", false)
    .neq("id", excludeMemberId)
    .order("email");
  if (error) throw new Error(error.message);

  const rows = (data as RawColleagueOption[] | null) || [];
  return rows.map((row) => ({ id: row.id, email: row.email, fullName: row.full_name }));
}

/**
 * Wraps [id]/page.tsx's own evaluator-picker colleagues query: active,
 * non-supervisor members, excluding the caller. See
 * `listCycleParticipantCandidates` above for why this is a separate
 * function rather than a shared parameterized one. Org-scoping is left to
 * RLS, same as the original query. Throws on query error.
 */
export async function listEvaluatorCandidates(excludeMemberId: string): Promise<ColleagueOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .eq("is_supervisor", false)
    .neq("id", excludeMemberId)
    .order("email");
  if (error) throw new Error(error.message);

  const rows = (data as RawColleagueOption[] | null) || [];
  return rows.map((row) => ({ id: row.id, email: row.email, fullName: row.full_name }));
}

/**
 * Wraps [id]/page.tsx's own `platform_settings` read (org-specific row
 * only, `.eq("organization_id", ...).maybeSingle()`). Deliberately does
 * NOT fall back to the platform-wide default row
 * (`organization_id is null`) the way `organize_cycle_evaluators`'s own
 * `coalesce(...)` does (0050_cycle_closing_date_and_edit_rules.sql:364-
 * 365) -- that asymmetry already exists in the original page and is out
 * of this story's scope to fix. Returns `null` when no org-specific row
 * exists, matching `.maybeSingle()`. Throws on query error.
 *
 * Cycles-domain audit fix: this file still returns the raw `number | null`
 * on purpose -- "no org-specific setting" (null) is a genuinely different
 * fact than "resolved to the page-level default of 5", and collapsing
 * them here would make that distinction unrecoverable for any future
 * caller. `cyclesManager.getMinInviteesPerRequest` (the layer above) is
 * the one that now applies the `?? 5` fallback that used to live at
 * cycles/[id]/page.tsx's own call site, so pages only ever see a plain
 * `number`.
 */
export async function getMinInviteesPerRequest(organizationId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { min_invitees_per_request: number } | null)?.min_invitees_per_request ?? null;
}

/**
 * Wraps `save_ai_interpretation` (called only from
 * `finalizeCycleRequest`, src/app/actions/cycles.ts, after
 * `generateAiInterpretation` -- a still-unmigrated cross-domain helper,
 * see this domain's own Boundaries). Deliberately does NOT check the
 * RPC's `error` return, unlike every other function in this file: the
 * original call site (`await supabase.rpc("save_ai_interpretation", {...})`
 * with no `{ error }` destructured) already never checked it either, so a
 * save failure here silently no-ops exactly as it does today -- changing
 * that would make a currently-swallowed failure suddenly throw and abort
 * `finalizeCycleRequest`'s own redirect, a real behavior change out of
 * this story's scope. `p_saboteadores_text` is left at its RPC-side
 * `default null` (0061_saboteadores.sql:337-340) -- the original call
 * only ever passed `p_request_id`/`p_text`, same here.
 */
export async function saveAiInterpretation(requestId: string, text: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("save_ai_interpretation", {
    p_request_id: requestId,
    p_text: text,
  });
}
