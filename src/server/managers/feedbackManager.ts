// Story 3.14 (_bmad-output/implementation-artifacts/
// spec-3-14-db-access-manager-scaffolding-feedback.md): manager layer
// owning the ad-hoc-feedback domain (spec.md sección 4.1). Calls only
// `@/server/db/feedback` -- never imports @supabase/supabase-js or
// @supabase/ssr directly, and never calls redirect()/revalidatePath() (those
// stay one layer up, in the Server Action, src/app/actions/feedback.ts,
// unmodified by this story) or reads cookies/headers itself. RPC errors
// propagate as plain Errors carrying the RPC's own message text unchanged,
// same as `cyclesManager`.
//
// One manager function per db function, 1:1, same shape as `cyclesManager`
// (Story 3.8). Never calls `cyclesManager`'s cycle-lifecycle RPCs, mirroring
// Story 3.8's split from the other side (its own header comment already
// excludes the ad-hoc-feedback RPCs as this domain's).
//
// Read-only reference this orchestration mirrors: src/app/actions/feedback.ts
// (unmodified by this story).

import "server-only";
// Cross-domain manager composition (allowed -- see this file's own header
// comment; same precedent as reportGroupsManager composing
// aiInterpretationManager) for getMyPendingRequestsSummary below, the
// cycle-request half of its merge.
import { getMyCycleRequests, type CycleRequestRow } from "@/server/managers/cyclesManager";
// Story 7.7 (ports upstream `69f6495`): the email-only-new-evaluators
// trigger for `updateRequestEvaluators`/`updateRequestEvaluatorsForIndividual`
// below -- reuses `responderManager`'s existing infra/email.ts-backed
// sender (AD-12), never constructs its own. feedbackManager.ts was locked
// by a parallel story when Story 7.6/its follow-up shipped (hence
// `createRequest`'s own email trigger living one layer up, in
// src/app/actions/feedback.ts); it's unlocked again for this story, so
// this trigger lands in its more correct home per AD-3, right next to the
// RPC call that produces the new invitees.
import { sendInvitationEmailsForNewInvitees } from "@/server/managers/responderManager";
import {
  createAdHocFeedbackRequest,
  createAdHocFeedbackRequestForIndividual,
  cancelAdHocFeedbackRequest,
  closeAdHocFeedbackRequest,
  updateAdHocFeedbackRequestEvaluators,
  updateAdHocFeedbackRequestEvaluatorsForIndividual,
  getRequestCompetencyNarrative,
  getMyPendingInvitations as dbGetMyPendingInvitations,
  getMyAdHocRequests as dbGetMyAdHocRequests,
  getMyCompetencyMap as dbGetMyCompetencyMap,
  getMyOpenRequestId as dbGetMyOpenRequestId,
  getMinInviteesPerRequest as dbGetMinInviteesPerRequest,
  getPlatformText as dbGetPlatformText,
  getEvaluatorCandidates as dbGetEvaluatorCandidates,
  getFeedbackRequestById as dbGetFeedbackRequestById,
  getFeedbackRequestProgress as dbGetFeedbackRequestProgress,
  getFeedbackInvitationsCount as dbGetFeedbackInvitationsCount,
  getFeedbackRequestInviteeMemberIds as dbGetFeedbackRequestInviteeMemberIds,
  getFeedbackRequestMemberInvitations as dbGetFeedbackRequestMemberInvitations,
  getFeedbackRequestEmailInvitations as dbGetFeedbackRequestEmailInvitations,
  getRequestCompetencyComparison as dbGetRequestCompetencyComparison,
  getRequestCompetencyByCategory as dbGetRequestCompetencyByCategory,
  getRequestSaboteadores as dbGetRequestSaboteadores,
  getFeedbackRequestAnswers as dbGetFeedbackRequestAnswers,
  type CompetencyNarrativeRow,
  type PendingInvitation,
  type FeedbackSubtype,
  type AdHocRequestRow,
  type CompetencyMapRow,
  type FeedbackRequestType,
  type EvaluatorCandidate,
  type FeedbackRequestDetail,
  type FeedbackRequestProgress,
  type FeedbackRequestMemberInvitation,
  type FeedbackRequestEmailInvitation,
  type CompetencyComparisonRow,
  type CompetencyByCategoryRow,
  type SaboteadorRow,
  type FeedbackAnswerRow,
} from "@/server/db/feedback";

export type {
  CompetencyNarrativeRow,
  PendingInvitation,
  FeedbackSubtype,
  AdHocRequestRow,
  CompetencyMapRow,
  FeedbackRequestType,
  EvaluatorCandidate,
  FeedbackRequestDetail,
  FeedbackRequestProgress,
  FeedbackRequestMemberInvitation,
  FeedbackRequestEmailInvitation,
  CompetencyComparisonRow,
  CompetencyByCategoryRow,
  SaboteadorRow,
  FeedbackAnswerRow,
};

export async function createRequest(
  inviteeMemberIds: string[],
  subtype: FeedbackSubtype = "general",
  name: string | null = null
): Promise<{ requestId: string }> {
  const requestId = await createAdHocFeedbackRequest(inviteeMemberIds, subtype, name);
  return { requestId };
}

export async function createIndividualRequest(
  inviteeEmails: string[],
  subtype: FeedbackSubtype = "general",
  name: string | null = null
): Promise<{ requestId: string }> {
  const requestId = await createAdHocFeedbackRequestForIndividual(inviteeEmails, subtype, name);
  return { requestId };
}

export async function cancelRequest(requestId: string): Promise<void> {
  await cancelAdHocFeedbackRequest(requestId);
}

export async function closeRequest(requestId: string): Promise<void> {
  await closeAdHocFeedbackRequest(requestId);
}

/**
 * Story 7.7: `updateAdHocFeedbackRequestEvaluators` now resolves and
 * returns exactly the newly-inserted invitees (the RPC itself is add-only
 * -- see its own doc comment in db/feedback.ts) -- this sends the
 * invitation email to only those, never re-notifying anyone already
 * invited.
 */
export async function updateRequestEvaluators(requestId: string, inviteeMemberIds: string[]): Promise<void> {
  const newInvites = await updateAdHocFeedbackRequestEvaluators(requestId, inviteeMemberIds);
  await sendInvitationEmailsForNewInvitees(requestId, newInvites);
}

/** Individual-account counterpart of updateRequestEvaluators above (email invitees, not member ids). Same email-only-new-invitees trigger, see its own doc comment. */
export async function updateRequestEvaluatorsForIndividual(
  requestId: string,
  inviteeEmails: string[]
): Promise<void> {
  const newInvites = await updateAdHocFeedbackRequestEvaluatorsForIndividual(requestId, inviteeEmails);
  await sendInvitationEmailsForNewInvitees(requestId, newInvites);
}

export async function getCompetencyNarrative(requestId: string): Promise<CompetencyNarrativeRow[]> {
  return getRequestCompetencyNarrative(requestId);
}

export async function getMyPendingInvitations(): Promise<PendingInvitation[]> {
  return dbGetMyPendingInvitations();
}

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition -- dashboard/page.tsx's ad_hoc-only in-progress-requests
// read and mi-mapa/page.tsx's competency-map read, composed here rather
// than through a new dedicated `reportsManager` (epics.md's own AC).

export async function getMyAdHocRequests(): Promise<AdHocRequestRow[]> {
  return dbGetMyAdHocRequests();
}

export async function getMyCompetencyMap(): Promise<CompetencyMapRow[]> {
  return dbGetMyCompetencyMap();
}

/**
 * dashboard/page.tsx's own "Mis feedbacks en curso" row shape -- an ad_hoc
 * request and a cycle request merged into one common shape for rendering
 * in a single list. Kept exactly as the page used to build it (including
 * the `feedback_cycles: unknown` field, which mimics supabase-js's own
 * untyped-embed inference for the old raw `feedback_cycles(name)` select --
 * the page's rendering code already reads it via
 * `as unknown as { name: string } | null`) -- this is a pure "move the
 * merge/sort into the manager" refactor (dashboard audit fix, Finding 4),
 * not a shape or behavior change.
 */
export type MyPendingRequestSummaryRow = {
  id: string;
  created_at: string;
  request_type: string;
  status: string;
  name: string | null;
  feedback_cycles: unknown;
  /**
   * Story 7.2: `closes_at` from `AdHocRequestRow`/`CycleRequestRow`
   * (db/feedback.ts, db/cycles.ts) -- always `null` for an `ad_hoc` row,
   * the request's real target/close date for a `cycle` row (see those
   * types' own doc comments). Surfaced so `getMyFeedbackRequestsByStatus`
   * below can render it on the "Mis feedbacks cerrados" section without
   * dashboard/page.tsx re-deriving anything from raw rows itself.
   */
  closesAt: string | null;
};

/**
 * Dashboard audit fix (Finding 4): composes `getMyAdHocRequests()` (this
 * domain) and `cyclesManager.getMyCycleRequests()` (cross-domain) into the
 * one already-sorted (`created_at` descending) list dashboard/page.tsx
 * renders as "Mis feedbacks en curso" -- this file's own header comment
 * already claimed this composition happened "through the manager layer per
 * Story 3.26", but the actual merge/sort used to run at the page itself;
 * this closes that gap.
 *
 * The two source reads settle independently (`Promise.allSettled`, not
 * `Promise.all` + one try/catch): one source failing must not blank out
 * the other's already-succeeded rows, same bug the page's own prior inline
 * comment on this exact merge called out -- so this function itself never
 * throws, defaulting either half to `[]` on its own rejection.
 */
export async function getMyPendingRequestsSummary(): Promise<MyPendingRequestSummaryRow[]> {
  const [adHocSettled, cycleSettled] = await Promise.allSettled([
    dbGetMyAdHocRequests(),
    getMyCycleRequests(),
  ]);
  const adHocRows: AdHocRequestRow[] = adHocSettled.status === "fulfilled" ? adHocSettled.value : [];
  const cycleRows: CycleRequestRow[] = cycleSettled.status === "fulfilled" ? cycleSettled.value : [];

  const mappedAdHoc: MyPendingRequestSummaryRow[] = adHocRows.map((r) => ({
    id: r.id,
    created_at: r.createdAt,
    request_type: "ad_hoc",
    status: r.status,
    name: r.name,
    feedback_cycles: null,
    closesAt: r.closesAt,
  }));
  const mappedCycle: MyPendingRequestSummaryRow[] = cycleRows.map((r) => ({
    id: r.id,
    created_at: r.createdAt,
    request_type: "cycle",
    status: r.status,
    name: null,
    feedback_cycles: r.cycleName ? { name: r.cycleName } : null,
    closesAt: r.closesAt,
  }));

  return [...mappedAdHoc, ...mappedCycle].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type MyFeedbackRequestsByStatus = {
  open: MyPendingRequestSummaryRow[];
  closed: MyPendingRequestSummaryRow[];
};

/**
 * Story 7.2 (epics.md "Story 7.2: Dashboard — En-Curso/Cerrado Split +
 * Report-Group Task Link"): dashboard/page.tsx used to render every row
 * from `getMyPendingRequestsSummary()` in one "Mis feedbacks en curso"
 * list, labeling an already-closed ad_hoc row inline (" — cerrada") --
 * mixing a request that's genuinely still live with one that's already
 * fixed. This is the status/eligibility split moved into the manager (same
 * class of fix as the dashboard audit's Finding 2/4, see this file's own
 * header comment): a sibling of `getMyPendingRequestsSummary()`, built on
 * its already-merged/sorted rows, so dashboard/page.tsx only ever renders
 * two already-decided lists instead of re-deriving "is this one closed"
 * itself.
 */
export async function getMyFeedbackRequestsByStatus(): Promise<MyFeedbackRequestsByStatus> {
  const rows = await getMyPendingRequestsSummary();
  return {
    open: rows.filter((r) => r.status !== "closed"),
    closed: rows.filter((r) => r.status === "closed"),
  };
}

// ---------------------------------------------------------------------------
// Page-migration follow-up (see db/feedback.ts's own header): straight 1:1
// pass-throughs for dashboard/feedback/nueva/page.tsx, nueva-360/page.tsx,
// [id]/page.tsx and [id]/gestionar/page.tsx, same shape as every function
// above.
// ---------------------------------------------------------------------------

export async function getMyOpenRequestId(
  requesterMemberId: string,
  requestType: FeedbackRequestType
): Promise<string | null> {
  return dbGetMyOpenRequestId(requesterMemberId, requestType);
}

// Same default the RPCs themselves fall back to when `platform_settings`
// has no row for the org (supabase/migrations/0001_initial_schema.sql:50).
// `db/feedback.ts`'s own `getMinInviteesPerRequest` deliberately stays
// `number | null` (it has no documented reason to resolve the fallback
// itself -- its doc comment only ever said "every call site then falls
// back to its own default of 5") -- this is that one fallback, applied
// once here instead of independently at each of the 4 pages that used to
// each write their own `?? 5`.
const DEFAULT_MIN_INVITEES = 5;

export async function getMinInviteesPerRequest(organizationId: string): Promise<number> {
  const configured = await dbGetMinInviteesPerRequest(organizationId);
  return configured ?? DEFAULT_MIN_INVITEES;
}

export async function getPlatformText(key: string, fallback: string): Promise<string> {
  return dbGetPlatformText(key, fallback);
}

export async function getEvaluatorCandidates(excludeMemberId: string): Promise<EvaluatorCandidate[]> {
  return dbGetEvaluatorCandidates(excludeMemberId);
}

export async function getFeedbackRequestById(id: string): Promise<FeedbackRequestDetail | null> {
  return dbGetFeedbackRequestById(id);
}

export async function getFeedbackRequestProgress(requestId: string): Promise<FeedbackRequestProgress | null> {
  return dbGetFeedbackRequestProgress(requestId);
}

export async function getFeedbackInvitationsCount(requestId: string): Promise<number> {
  return dbGetFeedbackInvitationsCount(requestId);
}

export type FeedbackRequestState = {
  request: FeedbackRequestDetail;
  progress: FeedbackRequestProgress | null;
  totalInvitees: number;
  /** `progress.responseCount` is peers only (never the requester's own
   * self-assessment, sección 6) -- this is that plus the self-assessment,
   * for "has everyone including me answered" checks. */
  totalResponseCount: number;
  isCycle: boolean;
  /**
   * "Definitivo" -- no further change is possible. For a 360: only the
   * requester finalizing it by hand (`status === "closed"`) -- "el usuario
   * es el dueño de su proceso, no las condiciones" (spec.md sección 4.1):
   * neither the closing date nor 100% of responses closes anything on
   * their own. For the ad-hoc/ágil flow, the older rule still applies:
   * closed, or every invitee has responded.
   */
  isFinal: boolean;
  /** A cycle/360 request can still take evaluator-list changes (add more,
   * or -- while `canFullyEditCycle` -- edit/remove existing ones) while
   * this is true. Equivalent to `!isFinal` for a cycle request specifically
   * (this page is cycle-only), kept as its own explicit fact rather than
   * relying on that equivalence, since `isFinal`'s ad-hoc branch means
   * something different. */
  canManageCycle: boolean;
  /** Evaluator identities/categories can only be edited or removed (not
   * just added to) while the request is open AND still has zero responses
   * of any kind (self included). */
  canFullyEditCycle: boolean;
};

/**
 * Composes `getFeedbackRequestById` + `getFeedbackRequestProgress` +
 * `getFeedbackInvitationsCount` into the one set of underlying facts (status,
 * response counts vs. thresholds) that both [id]/page.tsx (the viewer's
 * "is this final/locked" question, `isFinal`) and [id]/gestionar/page.tsx
 * (the requester's "can I still edit this" question, `canManageCycle`/
 * `canFullyEditCycle`) used to independently re-derive with two different,
 * hand-rolled formulas. Returns `null` when the request itself doesn't
 * exist/isn't visible (same as `getFeedbackRequestById`) -- callers redirect
 * on that, same as today.
 */
export async function getRequestState(requestId: string): Promise<FeedbackRequestState | null> {
  const request = await dbGetFeedbackRequestById(requestId);
  if (!request) return null;

  const progress = await dbGetFeedbackRequestProgress(requestId);
  const totalInvitees = await dbGetFeedbackInvitationsCount(requestId);
  const totalResponseCount = (progress?.responseCount ?? 0) + (progress?.selfResponded ? 1 : 0);
  const isCycle = request.requestType === "cycle";

  const isFinal = isCycle
    ? request.status === "closed"
    : request.status === "closed" || totalResponseCount >= totalInvitees;

  const canManageCycle = request.status === "open";
  const canFullyEditCycle = canManageCycle && totalResponseCount === 0;

  return {
    request,
    progress,
    totalInvitees,
    totalResponseCount,
    isCycle,
    isFinal,
    canManageCycle,
    canFullyEditCycle,
  };
}

export async function getFeedbackRequestInviteeMemberIds(requestId: string): Promise<string[]> {
  return dbGetFeedbackRequestInviteeMemberIds(requestId);
}

export async function getFeedbackRequestMemberInvitations(
  requestId: string
): Promise<FeedbackRequestMemberInvitation[]> {
  return dbGetFeedbackRequestMemberInvitations(requestId);
}

export async function getFeedbackRequestEmailInvitations(
  requestId: string
): Promise<FeedbackRequestEmailInvitation[]> {
  return dbGetFeedbackRequestEmailInvitations(requestId);
}

export async function getRequestCompetencyComparison(requestId: string): Promise<CompetencyComparisonRow[]> {
  return dbGetRequestCompetencyComparison(requestId);
}

export async function getRequestCompetencyByCategory(requestId: string): Promise<CompetencyByCategoryRow[]> {
  return dbGetRequestCompetencyByCategory(requestId);
}

export async function getRequestSaboteadores(requestId: string): Promise<SaboteadorRow[]> {
  return dbGetRequestSaboteadores(requestId);
}

export async function getFeedbackRequestAnswers(requestId: string, isSelf: boolean): Promise<FeedbackAnswerRow[]> {
  return dbGetFeedbackRequestAnswers(requestId, isSelf);
}

export type FeedbackRequestHeadlineSummary = {
  headlineStrength: string;
  growthArea: string;
};

const NO_HEADLINE_DATA_MESSAGE = "Todavía no hay datos suficientes para un resumen.";

/**
 * Ranks [id]/page.tsx's own reveal-gate headline summary (EXPERIENCE.md
 * "headline strength + one growth area") -- the strongest/weakest
 * competency (by `peerAvgValue`) for a cycle/360, or the most-mentioned
 * competency per question position (1 = strength, 2 = challenge) for the
 * ad-hoc "por competencias" flow. Takes the same rows the page already
 * loaded for its own detailed rendering (`getRequestCompetencyComparison`
 * for a cycle, `getCompetencyNarrative` for ad-hoc) rather than
 * re-fetching them -- both are already gated on `revealed` (not `isFinal`)
 * at the call site, and passing `[]` here (the pre-reveal state) is exactly
 * what produces the "not enough data yet" copy below, same as before.
 */
export function getRequestHeadlineSummary(
  isCycle: boolean,
  competencyComparison: CompetencyComparisonRow[],
  competencyNarrative: CompetencyNarrativeRow[]
): FeedbackRequestHeadlineSummary {
  if (isCycle) {
    const withPeerAvg = competencyComparison.filter((row) => row.peerAvgValue != null);
    if (withPeerAvg.length === 0) {
      return { headlineStrength: NO_HEADLINE_DATA_MESSAGE, growthArea: NO_HEADLINE_DATA_MESSAGE };
    }
    const strongest = withPeerAvg.reduce((a, b) => ((b.peerAvgValue as number) > (a.peerAvgValue as number) ? b : a));
    const weakest = withPeerAvg.reduce((a, b) => ((b.peerAvgValue as number) < (a.peerAvgValue as number) ? b : a));
    return {
      headlineStrength: `${strongest.competencyName} · ${(strongest.peerAvgValue as number).toFixed(1)} / 5`,
      growthArea: `${weakest.competencyName} · ${(weakest.peerAvgValue as number).toFixed(1)} / 5`,
    };
  }

  const strengths = competencyNarrative.filter((row) => row.questionPosition === 1);
  const challenges = competencyNarrative.filter((row) => row.questionPosition === 2);
  const topOf = (rows: CompetencyNarrativeRow[]) =>
    rows.length > 0 ? rows.reduce((a, b) => (b.mentionCount > a.mentionCount ? b : a)) : null;
  const topStrength = topOf(strengths);
  const topChallenge = topOf(challenges);

  return {
    headlineStrength: topStrength
      ? `${topStrength.competencyName || topStrength.competencyCode} · ${
          topStrength.mentionCount === 1 ? "1 mención" : `${topStrength.mentionCount} menciones`
        }`
      : NO_HEADLINE_DATA_MESSAGE,
    growthArea: topChallenge
      ? `${topChallenge.competencyName || topChallenge.competencyCode} · ${
          topChallenge.mentionCount === 1 ? "1 mención" : `${topChallenge.mentionCount} menciones`
        }`
      : NO_HEADLINE_DATA_MESSAGE,
  };
}
