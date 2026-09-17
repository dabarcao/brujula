// Story 3.20 (_bmad-output/implementation-artifacts/
// spec-3-20-db-access-manager-scaffolding-responder-invitation.md):
// manager layer owning the responder/invitation domain. Calls only
// `@/server/db/responder` -- never imports @supabase/supabase-js or
// @supabase/ssr directly, and never calls redirect()/revalidatePath()
// (those stay one layer up, in a Server Action/Server Component -- both
// untouched by this story) or reads cookies/headers itself. RPC errors
// propagate as plain Errors carrying the RPC's own message text unchanged,
// same as `feedbackManager`.
//
// Structurally different from every other manager in this codebase
// (AD-7/FR4): this domain's auth model is token-only, so this file never
// calls `requireApiToken()` -- achieved simply by not calling it, no new
// validation code needed or written here.
//
// One manager function per db function, 1:1, same shape as
// `feedbackManager` (Story 3.14).
//
// Read-only reference this orchestration mirrors: src/app/responder/
// [token]/page.tsx, src/app/invitacion/[token]/page.tsx and
// src/app/actions/feedback.ts:200-256 (all unmodified by this story).
//
// Story 7.6 (epics.md, "Email Infrastructure (Resend) + Responder
// Intro/Finalize UX"): this domain owns `feedback_invitations`, so the
// email side effects that hang off it -- inviting people, thanking a
// no-account responder -- land here too, per AD-12 ("Infrastructure-
// service integrations get their own infra/ layer, called only from a
// manager"). `sendInvitationEmails` is deliberately callable for BOTH the
// ad-hoc domain (feedbackManager) and the cycles domain (cyclesManager):
// email delivery isn't request-type-specific, it only needs a requestId,
// so one function here serves both rather than being duplicated per
// domain. `cyclesManager.organizeEvaluators`/`createIndividualRequest`
// call it directly (cross-manager composition, same precedent as
// `feedbackManager` calling `cyclesManager`). `src/app/actions/feedback.ts`
// calls it too, but from the Server Action rather than from inside
// `feedbackManager` -- a deliberate exception, not the normal pattern; see
// that file's own comment for why (a parallel story owns feedbackManager.ts
// while this one shipped).

import "server-only";
import {
  getResponderContext,
  getInviteDetails as dbGetInviteDetails,
  submitFeedbackResponse as dbSubmitFeedbackResponse,
  getInvitationEmailContext,
  type ResponderContext,
  type ResponderQuestion,
  type ScaleLevel,
  type CompetencyOption,
  type InviteDetails,
  type FeedbackAnswerInput,
} from "@/server/db/responder";
// Cross-domain db import, not a manager import: `getPlatformText` is the
// "shared read-only helper" AD-3 already anticipates ("lives once, in
// whichever db/*.ts file needs it first, and the other imports it") --
// importing it from `feedbackManager` instead would create a real import
// cycle (cyclesManager -> responderManager -> feedbackManager ->
// cyclesManager, see cyclesManager.ts's own `sendInvitationEmails` calls),
// which this avoids entirely.
import { getPlatformText } from "@/server/db/feedback";
import { sendEmail, getSiteUrl, renderMarkdownLiteHtml, renderEmailHtml } from "@/server/infra/email";

export type { ResponderContext, ResponderQuestion, ScaleLevel, CompetencyOption, InviteDetails, FeedbackAnswerInput };

export async function getContext(token: string): Promise<ResponderContext> {
  return getResponderContext(token);
}

export async function getInviteDetails(token: string): Promise<InviteDetails[]> {
  return dbGetInviteDetails(token);
}

export async function submitResponse(
  token: string,
  answers: FeedbackAnswerInput[]
): Promise<{ responseId: string }> {
  const { responseId, inviteeEmail } = await dbSubmitFeedbackResponse(token, answers);

  // Best-effort, never lets an email failure surface as a submission
  // failure -- the response itself already succeeded by this point. Same
  // "never breaks the calling flow" contract as infra/email.ts's own
  // no-RESEND_API_KEY no-op.
  if (inviteeEmail) {
    try {
      await sendThankYouEmail(inviteeEmail);
    } catch (e) {
      console.error("responderManager.submitResponse: no se pudo mandar el email de agradecimiento:", e);
    }
  }

  return { responseId };
}

async function sendThankYouEmail(email: string): Promise<void> {
  const [subject, bodyTemplate] = await Promise.all([
    getPlatformText("thank_you_email_subject", "Gracias por tu feedback"),
    getPlatformText(
      "thank_you_email_body",
      "Gracias por dedicar unos minutos a dar tu feedback.\n\n**Tú también puedes pedir feedback a tu alrededor** — es gratis empezar."
    ),
  ]);

  await sendEmail({
    to: email,
    subject,
    html: renderEmailHtml({
      bodyHtml: renderMarkdownLiteHtml(bodyTemplate),
      ctaLabel: "Crear mi cuenta",
      ctaLink: `${getSiteUrl()}/registro`,
    }),
  });
}

/**
 * Subject/body/link-base shared by `sendInvitationEmails` and
 * `sendInvitationEmailsForNewInvitees` below -- factored out so the two
 * never drift in wording (Story 7.7, ports upstream `69f6495`'s own
 * `buildInvitationEmailContext` split). `null` only if the request itself
 * doesn't exist (unreachable in practice -- both callers run right after a
 * successful create/add-evaluators RPC on that same request).
 */
async function buildInvitationEmailParts(
  requesterName: string
): Promise<{ subject: string; bodyHtml: string; siteUrl: string }> {
  const [subjectTemplate, bodyTemplate] = await Promise.all([
    getPlatformText("invitation_email_subject", "{nombre} te pide tu feedback"),
    getPlatformText(
      "invitation_email_body",
      "**{nombre}** te pide que le des tu feedback en Brújula — le va a ser muy valioso para seguir creciendo.\n\nEs completamente anónimo: nadie, ni siquiera {nombre}, sabrá qué respondiste. Solo te llevará unos minutos, y cuanto más sincero seas, más le vas a ayudar."
    ),
  ]);

  return {
    subject: subjectTemplate.replaceAll("{nombre}", requesterName),
    bodyHtml: renderMarkdownLiteHtml(bodyTemplate.replaceAll("{nombre}", requesterName)),
    siteUrl: getSiteUrl(),
  };
}

/**
 * Sends the invitation email to every non-self invitee of a just-created
 * (or just-extended) feedback request -- ad-hoc or cycle, company or
 * individual account. Never sent to the requester's own "self" invitation
 * (self-evaluation, cycle-only) -- whoever just created the request
 * already knows they need to self-assess; a notification at that moment
 * would be redundant. Best-effort throughout: never throws, so a caller
 * right after a successful request-creation RPC can call this
 * unconditionally without its own try/catch (same contract as
 * `aiInterpretationManager`'s functions).
 */
export async function sendInvitationEmails(requestId: string): Promise<void> {
  try {
    const context = await getInvitationEmailContext(requestId);
    if (!context || context.recipients.length === 0) return;

    const { subject, bodyHtml, siteUrl } = await buildInvitationEmailParts(context.requesterName);

    for (const recipient of context.recipients) {
      await sendEmail({
        to: recipient.email,
        subject,
        html: renderEmailHtml({
          bodyHtml,
          ctaLabel: "Dar mi feedback",
          ctaLink: `${siteUrl}/responder/${recipient.token}`,
        }),
      });
    }
  } catch (e) {
    console.error("responderManager.sendInvitationEmails: no se pudieron mandar los emails de invitación:", e);
  }
}

/**
 * Story 7.7 (ports upstream `69f6495`): sends the invitation email to only
 * the given, already-known new invitees of an *existing* ad-hoc or cycle
 * request -- called right after "add more evaluators" (feedbackManager's
 * `updateRequestEvaluators`/`updateRequestEvaluatorsForIndividual`,
 * cyclesManager's `updateRequestEvaluators`/`updateIndividualRequestEvaluators`)
 * succeeds. Unlike `sendInvitationEmails` above, the caller already knows
 * exactly who is new -- the underlying RPCs
 * (`update_ad_hoc_feedback_request_evaluators[_for_individual]`,
 * `update_[individual_]cycle_request_evaluators`) are add-only as of their
 * final redefinition (renumbered `0094_fix_ambiguous_returning_column.sql`,
 * see Story 7.6 follow-up commit `5ce2cc3`) and return exactly the
 * newly-inserted `{invitee_member_id | invitee_email, token}` rows, already
 * resolved to `{email, token}` by `db/feedback.ts`/`db/cycles.ts` -- so
 * there is no re-querying "who is new" here, only who to email and what to
 * say to them (`getInvitationEmailContext`, reused here only for its
 * `requesterName`, not its `.recipients`). Same best-effort, never-throws
 * contract as `sendInvitationEmails`.
 */
export async function sendInvitationEmailsForNewInvitees(
  requestId: string,
  invitees: { email: string; token: string }[]
): Promise<void> {
  if (invitees.length === 0) return;

  try {
    const context = await getInvitationEmailContext(requestId);
    if (!context) return;

    const { subject, bodyHtml, siteUrl } = await buildInvitationEmailParts(context.requesterName);

    for (const invitee of invitees) {
      await sendEmail({
        to: invitee.email,
        subject,
        html: renderEmailHtml({
          bodyHtml,
          ctaLabel: "Dar mi feedback",
          ctaLink: `${siteUrl}/responder/${invitee.token}`,
        }),
      });
    }
  } catch (e) {
    console.error(
      "responderManager.sendInvitationEmailsForNewInvitees: no se pudieron mandar los emails de invitación:",
      e
    );
  }
}
