// Story 1.2 (_bmad-output/implementation-artifacts/
// spec-1-2-db-access-manager-scaffolding-report-groups.md): manager layer
// owning the full report-groups domain (spec.md sección 17), including
// reads (getGroup, getGroupCompetencySummary) that this story's own tests
// don't exercise directly but Story 1.5's Route Handler will need.
//
// Calls only `@/server/db/reportGroups` and `@/server/db/aiInterpretations`
// -- never imports @supabase/supabase-js or @supabase/ssr directly, and
// never calls redirect()/revalidatePath() (those stay one layer up, in the
// Server Action -- Story 1.6) or reads cookies/headers itself. RPC errors
// propagate as plain Errors carrying the RPC's own message text unchanged;
// translating that into the `{error:{code,message}}` envelope is the Route
// Handler's job (Story 1.5), not this manager's.
//
// Read-only reference this orchestration mirrors: src/app/actions/reportGroups.ts
// (unmodified by this story).

import "server-only";
import {
  createReportGroup,
  addReportGroupMembers,
  removeReportGroupMember,
  respondToReportGroup,
  closeReportGroup,
  getReportGroup,
  getReportGroupCompetencySummary,
  getMyReportGroups as dbGetMyReportGroups,
  type ReportGroupDetail,
  type ReportGroupCompetencySummaryRow,
  type ReportGroupSummaryRow,
  type NewReportGroupInvitee,
} from "@/server/db/reportGroups";
import { saveReportGroupInterpretation } from "@/server/db/aiInterpretations";
import { generateReportGroupInterpretation } from "@/server/managers/aiInterpretationManager";
// Cross-domain db import, not a manager import -- same precedent
// responderManager.ts's own header documents for this exact helper
// (getPlatformText lives once, in whichever db/*.ts needs it first).
import { getPlatformText } from "@/server/db/feedback";
import { sendEmail, getSiteUrl, renderMarkdownLiteHtml, renderEmailHtml } from "@/server/infra/email";

export type { ReportGroupSummaryRow };

// 2026-09-17: report groups never sent any email before this -- the only
// way to learn about an invitation was to notice a new "Tareas pendientes"
// row on next login. This is the AD-12 infra/email.ts call site for that,
// analogous to responderManager.sendInvitationEmails but for the
// report-groups domain (group invitations aren't feedback_invitations
// rows, so they don't fit that function). Best-effort, never throws --
// same contract as every other email trigger in this app: a failed email
// must never fail the create/invite flow that triggered it.
async function sendGroupInviteEmails(
  groupName: string,
  invitees: NewReportGroupInvitee[]
): Promise<void> {
  if (invitees.length === 0) return;

  try {
    const requesterName = invitees[0].inviterFullName || invitees[0].inviterEmail || "Alguien";

    const [subjectTemplate, bodyTemplate] = await Promise.all([
      getPlatformText("report_group_invite_email_subject", "{nombre} te ha invitado a un grupo: {grupo}"),
      getPlatformText(
        "report_group_invite_email_body",
        "**{nombre}** te ha invitado a formar parte del grupo **{grupo}** en Brújula. Puedes aceptar o rechazar la invitación desde tu panel."
      ),
    ]);

    const subject = subjectTemplate.replaceAll("{nombre}", requesterName).replaceAll("{grupo}", groupName);
    const bodyHtml = renderMarkdownLiteHtml(
      bodyTemplate.replaceAll("{nombre}", requesterName).replaceAll("{grupo}", groupName)
    );
    // Group invitees are already-registered company members (unlike
    // feedback_invitations' token-based responder links for anonymous/
    // external evaluators) -- the email links straight to the dashboard's
    // own groups list, behind normal login, not a token URL.
    const ctaLink = `${getSiteUrl()}/dashboard/groups`;

    for (const invitee of invitees) {
      await sendEmail({
        to: invitee.email,
        subject,
        html: renderEmailHtml({ bodyHtml, ctaLabel: "Ver la invitación", ctaLink }),
      });
    }
  } catch (e) {
    console.error("reportGroupsManager.sendGroupInviteEmails: no se pudieron mandar los emails:", e);
  }
}

export async function createGroup(name: string, memberIds: string[]): Promise<{ groupId: string }> {
  const result = await createReportGroup(name, memberIds);
  await sendGroupInviteEmails(name.trim(), result.invitees);
  return { groupId: result.groupId };
}

/**
 * Invites more people to an already-open group, or re-invites someone who
 * had rejected (add_report_group_members resets them to 'pending') --
 * never touches someone already pending/accepted. Only the invitees
 * actually added/re-invited get an email (db/reportGroups.ts's own
 * "insert-only-new" contract).
 */
export async function addMembers(groupId: string, memberIds: string[]): Promise<void> {
  const newInvitees = await addReportGroupMembers(groupId, memberIds);
  if (newInvitees.length === 0) return;

  const group = await getReportGroup(groupId);
  await sendGroupInviteEmails(group.name, newInvitees);
}

/**
 * Drops someone from an open group -- typically someone who never
 * responded or who rejected, so the rest of the group can still reach the
 * "everyone accepted" bar close_report_group now requires. No email: this
 * is a correction to who's in the group, not an invitation.
 */
export async function removeMember(groupId: string, memberId: string): Promise<void> {
  await removeReportGroupMember(groupId, memberId);
}

export async function respondToGroup(groupId: string, accept: boolean): Promise<void> {
  await respondToReportGroup(groupId, accept);
}

/**
 * Closes the group, then generates and (if successful) persists the AI
 * interpretation -- exactly where closeReportGroup (src/app/actions/reportGroups.ts)
 * does today. The close itself can throw (e.g. below the accepted-member
 * threshold). Generation is best-effort and never throws (see
 * aiInterpretationManager), but a subsequent save failure propagates like
 * every other RPC call in this file.
 */
export async function closeGroup(
  groupId: string
): Promise<{ aiInterpretation: string | null; aiOpenPatternsText: string | null }> {
  await closeReportGroup(groupId);

  // generateReportGroupInterpretation never throws (see aiInterpretationManager) --
  // missing API key, empty summary, or a failed Anthropic call all resolve to null.
  const result = await generateReportGroupInterpretation(groupId);
  if (result) {
    await saveReportGroupInterpretation(groupId, result.competencias, result.patterns);
  }

  return { aiInterpretation: result?.competencias ?? null, aiOpenPatternsText: result?.patterns ?? null };
}

export async function getGroup(groupId: string): Promise<ReportGroupDetail> {
  return getReportGroup(groupId);
}

export async function getGroupCompetencySummary(
  groupId: string
): Promise<ReportGroupCompetencySummaryRow[]> {
  return getReportGroupCompetencySummary(groupId);
}

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition -- dashboard/page.tsx's own report-groups read, composed
// here rather than through a new dedicated `reportsManager` (epics.md's
// own AC), since this manager already owns the report-groups domain.
export async function getMyReportGroups(): Promise<ReportGroupSummaryRow[]> {
  return dbGetMyReportGroups();
}
