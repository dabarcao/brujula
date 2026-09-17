// Story 3.8 (_bmad-output/implementation-artifacts/
// spec-3-8-db-access-manager-scaffolding-cycles.md): manager layer owning
// the cycle-lifecycle domain (spec.md sección 4.1). Calls only
// `@/server/db/cycles` -- never imports @supabase/supabase-js or
// @supabase/ssr directly, and never calls redirect()/revalidatePath() (those
// stay one layer up, in the Server Action -- Story 3.10) or reads
// cookies/headers itself. RPC errors propagate as plain Errors carrying the
// RPC's own message text unchanged, same as `adminManager`/
// `reportGroupsManager`.
//
// One manager function per db function, 1:1, same shape as `adminManager`
// (Story 3.2) -- confirmed as the established pattern, not a narrower
// subset, per this story's own Intent. Never calls the ad-hoc-feedback RPCs
// `feedbackManager` owns, and never orchestrates `finalizeCycleRequest`'s
// AI-interpretation side effect (a different, still-unmigrated, cross-domain
// helper -- see this story's own Boundaries).
//
// Read-only reference this orchestration mirrors: src/app/actions/cycles.ts
// (unmodified by this story).

import "server-only";
// Cross-domain manager composition (allowed -- see this file's own header
// comment; same precedent as `feedbackManager` calling `getMyCycleRequests`
// from here). Story 7.6: invitation emails are triggered from inside this
// manager (not from src/app/actions/cycles.ts) because triggering a side
// effect right after a successful creation RPC is exactly the kind of
// business orchestration AD-3 says belongs in a manager, not a Server
// Action -- see responderManager.ts's own header for why this one function
// serves both the cycles and ad-hoc-feedback domains.
// Story 7.7: `sendInvitationEmailsForNewInvitees` is this same trigger's
// email-only-new-evaluators sibling, for `updateRequestEvaluators`/
// `updateIndividualRequestEvaluators` below (add-evaluators-to-an-existing
// request, not create) -- see its own doc comment in responderManager.ts.
import { sendInvitationEmails, sendInvitationEmailsForNewInvitees } from "@/server/managers/responderManager";
import {
  createFeedbackCycle,
  closeCycleRequest,
  organizeCycleEvaluators,
  createIndividualCycleRequest,
  updateCycleRequestEvaluators,
  updateIndividualCycleRequestEvaluators,
  getCycleStatus,
  getColleaguesWithClosedCycle as dbGetColleaguesWithClosedCycle,
  getMyCycleRequests as dbGetMyCycleRequests,
  getMyOpenCycles as dbGetMyOpenCycles,
  listOrganizationCycles as dbListOrganizationCycles,
  getCycleById as dbGetCycleById,
  isCycleParticipant as dbIsCycleParticipant,
  getExistingCycleRequestId as dbGetExistingCycleRequestId,
  listCycleParticipantCandidates as dbListCycleParticipantCandidates,
  listEvaluatorCandidates as dbListEvaluatorCandidates,
  getMinInviteesPerRequest as dbGetMinInviteesPerRequest,
  saveAiInterpretation as dbSaveAiInterpretation,
  type CycleParticipantCategory,
  type CycleStatusRow,
  type ColleagueWithClosedCycle,
  type CycleRequestRow,
  type OpenCycleRow,
  type OrgCycleRow,
  type CycleRow,
  type ColleagueOption,
} from "@/server/db/cycles";

export type {
  CycleParticipantCategory,
  CycleStatusRow,
  ColleagueWithClosedCycle,
  CycleRequestRow,
  OpenCycleRow,
  OrgCycleRow,
  CycleRow,
  ColleagueOption,
};

export async function createCycle(
  name: string,
  opensAt: string,
  closesAt: string,
  participantMemberIds: string[]
): Promise<{ cycleId: string }> {
  const cycleId = await createFeedbackCycle(name, opensAt, closesAt, participantMemberIds);
  return { cycleId };
}

/**
 * Closes the cycle request only -- deliberately does NOT generate or save
 * the AI interpretation `finalizeCycleRequest` (src/app/actions/cycles.ts)
 * produces today. That helper (`generateAiInterpretation`,
 * src/lib/aiInterpretation.ts) internally calls feedback-domain RPCs
 * (get_request_competency_comparison/get_request_competency_by_category/
 * get_request_saboteadores) and is not cleanly cycles-owned -- unaffected
 * by this story, per its own Boundaries.
 */
export async function closeRequest(requestId: string): Promise<void> {
  await closeCycleRequest(requestId);
}

export async function organizeEvaluators(
  cycleId: string,
  evaluatorMemberIds: string[],
  evaluatorCategories: CycleParticipantCategory[]
): Promise<{ requestId: string }> {
  const requestId = await organizeCycleEvaluators(cycleId, evaluatorMemberIds, evaluatorCategories);
  await sendInvitationEmails(requestId);
  return { requestId };
}

export async function createIndividualRequest(
  evaluatorEmails: string[],
  evaluatorCategories: CycleParticipantCategory[],
  closesAt: string,
  name: string | null
): Promise<{ requestId: string }> {
  const requestId = await createIndividualCycleRequest(evaluatorEmails, evaluatorCategories, closesAt, name);
  await sendInvitationEmails(requestId);
  return { requestId };
}

/**
 * Story 7.7: `updateCycleRequestEvaluators` now resolves and returns
 * exactly the newly-inserted evaluators (the RPC itself is add-only -- see
 * its own doc comment in db/cycles.ts) -- this sends the invitation email
 * to only those, never re-notifying anyone already invited.
 */
export async function updateRequestEvaluators(
  requestId: string,
  evaluatorMemberIds: string[],
  evaluatorCategories: CycleParticipantCategory[]
): Promise<void> {
  const newInvites = await updateCycleRequestEvaluators(requestId, evaluatorMemberIds, evaluatorCategories);
  await sendInvitationEmailsForNewInvitees(requestId, newInvites);
}

/** Individual-account counterpart of updateRequestEvaluators above (email invitees, not member ids). Same email-only-new-invitees trigger, see its own doc comment. */
export async function updateIndividualRequestEvaluators(
  requestId: string,
  evaluatorEmails: string[],
  evaluatorCategories: CycleParticipantCategory[]
): Promise<void> {
  const newInvites = await updateIndividualCycleRequestEvaluators(requestId, evaluatorEmails, evaluatorCategories);
  await sendInvitationEmailsForNewInvitees(requestId, newInvites);
}

export async function getStatus(cycleId: string): Promise<CycleStatusRow[]> {
  return getCycleStatus(cycleId);
}

export async function getColleaguesWithClosedCycle(): Promise<ColleagueWithClosedCycle[]> {
  return dbGetColleaguesWithClosedCycle();
}

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition -- dashboard/page.tsx's cycle-only in-progress-requests read
// and its open-company-cycles read, composed here rather than through a
// new dedicated `reportsManager` (epics.md's own AC).

export async function getMyCycleRequests(): Promise<CycleRequestRow[]> {
  return dbGetMyCycleRequests();
}

export async function getMyOpenCycles(): Promise<OpenCycleRow[]> {
  return dbGetMyOpenCycles();
}

/**
 * Dashboard audit fix (Finding 2): "which of my currently-open cycles still
 * need me to organize evaluators" -- a cycle already has its own organized
 * request (a cycle-type `feedback_requests` row this member is the
 * requester of, via `getMyCycleRequests()`) shows up instead in "Mis
 * feedbacks en curso"; this composes `getMyOpenCycles()` minus that set, so
 * it isn't listed twice. Moved out of dashboard/page.tsx's own
 * `cyclesToOrganize`/`cycleRequestByCycleId` cross-reference: judged a real
 * business rule (drives what the page tells the member they still need to
 * do), not page-level display formatting, and both underlying reads already
 * live in this manager, so composing them here is a clean, non-disruptive
 * join -- no shape change to either existing function. Preserves the
 * page's own opens_at-ascending order.
 */
export async function getCyclesNeedingOrganization(): Promise<OpenCycleRow[]> {
  const [openCycles, cycleRequests] = await Promise.all([getMyOpenCycles(), getMyCycleRequests()]);

  const organizedCycleIds = new Set(
    cycleRequests.map((r) => r.cycleId).filter((id): id is string => id !== null)
  );

  return openCycles
    .filter((cycle) => !organizedCycleIds.has(cycle.id))
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

// ---------------------------------------------------------------------------
// Story 6.4 (cycles-domain migration): one manager function per new
// db/cycles.ts function above, same 1:1 shape as this file's own header
// comment -- closes out dashboard/cycles/page.tsx, nueva/page.tsx,
// [id]/page.tsx, [id]/estado/page.tsx and actions/cycles.ts's remaining
// direct Supabase calls.
// ---------------------------------------------------------------------------

export async function listOrganizationCycles(organizationId: string): Promise<OrgCycleRow[]> {
  return dbListOrganizationCycles(organizationId);
}

export async function getCycleById(cycleId: string): Promise<CycleRow | null> {
  return dbGetCycleById(cycleId);
}

export async function isCycleParticipant(cycleId: string, memberId: string): Promise<boolean> {
  return dbIsCycleParticipant(cycleId, memberId);
}

export async function getExistingCycleRequestId(
  cycleId: string,
  requesterMemberId: string
): Promise<string | null> {
  return dbGetExistingCycleRequestId(cycleId, requesterMemberId);
}

export async function listCycleParticipantCandidates(excludeMemberId: string): Promise<ColleagueOption[]> {
  return dbListCycleParticipantCandidates(excludeMemberId);
}

export async function listEvaluatorCandidates(excludeMemberId: string): Promise<ColleagueOption[]> {
  return dbListEvaluatorCandidates(excludeMemberId);
}

/**
 * Cycles-domain audit fix: resolves the org-specific `platform_settings`
 * value to a plain `number`, applying the `?? 5` fallback that used to
 * live at cycles/[id]/page.tsx's own call site -- see db/cycles.ts's own
 * `getMinInviteesPerRequest` doc comment for why that db-layer function
 * itself still returns `number | null` unchanged (a real "no setting"
 * fact, distinct from this page-level default).
 */
export async function getMinInviteesPerRequest(organizationId: string): Promise<number> {
  const minInvitees = await dbGetMinInviteesPerRequest(organizationId);
  return minInvitees ?? 5;
}

/**
 * Closes out `finalizeCycleRequest`'s (actions/cycles.ts) last direct RPC
 * call. See db/cycles.ts's own `saveAiInterpretation` doc comment for why
 * this deliberately never throws on failure -- same as the original call
 * site.
 */
export async function saveAiInterpretation(requestId: string, text: string): Promise<void> {
  await dbSaveAiInterpretation(requestId, text);
}
