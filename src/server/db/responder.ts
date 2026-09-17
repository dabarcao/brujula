// Story 3.20 (_bmad-output/implementation-artifacts/
// spec-3-20-db-access-manager-scaffolding-responder-invitation.md):
// db-access layer for the responder/invitation domain -- thin, typed
// wrappers around the 3 RPCs Story 3.19 actually characterized
// (get_responder_context, get_invite_details, submit_feedback_response),
// mirroring src/server/db/feedback.ts's shape exactly (Story 3.14): this
// file is deliberately the only new code for this domain that constructs a
// Supabase client; every exported function is plain-TypeScript typed (no
// PostgrestError, no raw SupabaseClient, in any signature). No
// threshold/token-validity logic is reimplemented here -- every RPC already
// validates its own token internally (confirmed by direct read of all 3
// RPCs' source, Story 3.19's own investigation); the token is passed
// straight through to each RPC unmodified.
//
// Read-only reference this was wrapped from: src/app/responder/[token]/
// page.tsx, src/app/invitacion/[token]/page.tsx and
// src/app/actions/feedback.ts:200-256 (all unmodified by this story --
// they keep calling supabase.rpc directly).
//
// Excluded from this domain (per this story's own frozen Intent):
// accept_member_invite/claim_pending_email_invitations -- already owned by
// membersManager/db/members.ts (Story 3.2, confirmed via grep, zero
// overlap).

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Matches `survey_questions.question_type`'s own check constraint
 * (supabase/migrations/0026_competency_text_question_type.sql:15-16). */
export type QuestionType = "open" | "scale" | "multiple_choice" | "competency";

export type ResponderQuestion = {
  id: string;
  prompt: string;
  required: boolean;
  questionType: QuestionType;
  maxSelections: number | null;
};

export type ScaleLevel = {
  level: number;
  label: string;
};

export type CompetencyOption = {
  code: string;
  name: string;
};

export type ResponderContext = {
  valid: boolean;
  used?: boolean;
  requiresLogin?: boolean;
  isSelf?: boolean;
  questions?: ResponderQuestion[];
  scaleLevels?: ScaleLevel[];
  competencies?: CompetencyOption[];
};

export type InviteDetails = {
  organizationName: string;
  email: string;
  fullName: string | null;
  valid: boolean;
};

/** Public, camelCase input shape for `submitFeedbackResponse`'s `answers`
 * -- mapped internally to `submit_feedback_response`'s own required
 * snake_case jsonb keys (`question_id`/`competency_code`/`answer_text`/
 * `answer_value`, supabase/migrations/0061_saboteadores.sql), the same
 * shape src/app/actions/feedback.ts's own submitFeedbackResponse already
 * builds inline. */
export type FeedbackAnswerInput = {
  questionId: string;
  answerText?: string;
  answerValue?: number | null;
  competencyCode?: string;
};

// Raw jsonb/row shapes as the RPCs actually return them (snake_case) --
// kept private to this file; callers only ever see the camelCase types
// above.
type RawResponderQuestion = {
  id: string;
  prompt: string;
  required: boolean;
  question_type: QuestionType;
  max_selections: number | null;
};

type RawResponderContext = {
  valid: boolean;
  used?: boolean;
  requires_login?: boolean;
  is_self?: boolean;
  questions?: RawResponderQuestion[];
  scale_levels?: ScaleLevel[];
  competencies?: CompetencyOption[];
};

type RawInviteDetails = {
  organization_name: string;
  email: string;
  full_name: string | null;
  valid: boolean;
};

/** Wraps `get_responder_context`. Never throws for an invalid/foreign
 * token -- that is the RPC's own `{valid: false}`/`{valid: false,
 * requires_login: true}` result, not an error. Only a genuine RPC-call
 * failure throws. */
export async function getResponderContext(token: string): Promise<ResponderContext> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_responder_context", { p_token: token });
  if (error) throw new Error(error.message);

  const raw = (data as RawResponderContext | null) || { valid: false };
  return {
    valid: raw.valid,
    used: raw.used,
    requiresLogin: raw.requires_login,
    isSelf: raw.is_self,
    questions: raw.questions?.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      required: q.required,
      questionType: q.question_type,
      maxSelections: q.max_selections,
    })),
    scaleLevels: raw.scale_levels,
    competencies: raw.competencies,
  };
}

/** Wraps `get_invite_details`. Returns `[]` for a bogus token -- the RPC's
 * own empty result, not an error. */
export async function getInviteDetails(token: string): Promise<InviteDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invite_details", { p_token: token });
  if (error) throw new Error(error.message);

  const rows = (data as RawInviteDetails[] | null) || [];
  return rows.map((row) => ({
    organizationName: row.organization_name,
    email: row.email,
    fullName: row.full_name,
    valid: row.valid,
  }));
}

export type SubmitFeedbackResponseResult = {
  responseId: string;
  /** Only non-null when the responder had no member account (a loose-email
   * invitation, never the self-assessment) -- `submit_feedback_response`
   * itself decides this rule (supabase/migrations/0088_thank_you_email.sql);
   * this file just surfaces whatever it returns. `responderManager` uses
   * this to decide whether to trigger the thank-you email, never
   * re-deriving the rule itself. */
  inviteeEmail: string | null;
};

/** Wraps `submit_feedback_response`. Throws the RPC's own message on
 * failure unmodified (e.g. invalid/already-used token, missing required
 * answers, wrong-user mismatch -- "Esta invitación no corresponde a tu
 * usuario."). */
export async function submitFeedbackResponse(
  token: string,
  answers: FeedbackAnswerInput[]
): Promise<SubmitFeedbackResponseResult> {
  const supabase = await createClient();
  // Relies on JSON.stringify silently dropping undefined-valued keys (the
  // Supabase client serializes RPC params as JSON) to reproduce the original
  // Server Action's per-question-type key construction -- e.g. a scale
  // answer's `competencyCode` is left undefined here and never gets sent as
  // a `competency_code` key at all. A future non-JSON transport would need
  // to strip these keys explicitly instead.
  const rpcAnswers = answers.map((a) => ({
    question_id: a.questionId,
    answer_text: a.answerText,
    answer_value: a.answerValue,
    competency_code: a.competencyCode,
  }));

  const { data, error } = await supabase.rpc("submit_feedback_response", {
    p_token: token,
    p_answers: rpcAnswers,
  });
  if (error) throw new Error(error.message);
  // submit_feedback_response returns `table(response_id uuid, invitee_email
  // text)` -- PostgREST returns a one-row array for a `returns table` RPC
  // (supabase/migrations/0088_thank_you_email.sql). Story 7.1 left
  // `invitee_email` unsurfaced ("Story 7.6's scope"); this is that story,
  // wiring it through for responderManager.submitResponse's thank-you-email
  // trigger.
  const row = (data as { response_id: string; invitee_email: string | null }[])[0];
  return { responseId: row.response_id, inviteeEmail: row.invitee_email };
}

export type InvitationRecipient = {
  /** The invitee's own single-use responder link, `/responder/{token}`. */
  token: string;
  email: string;
};

export type InvitationEmailContext = {
  requesterName: string;
  recipients: InvitationRecipient[];
};

type RawInvitationRow = {
  token: string;
  invitee_email: string | null;
  evaluator_category: string | null;
  members: { email: string } | null;
};

/**
 * Read `sendInvitationEmails` (responderManager) needs: the requester's
 * display name, plus every non-self invitation's recipient email + token,
 * for a `feedback_requests` id -- called right after a request-creation RPC
 * (`create_ad_hoc_feedback_request*`/`organize_cycle_evaluators`/
 * `create_individual_cycle_request`) succeeds, regardless of which domain
 * created it (email-sending itself isn't RPC-shaped -- Postgres can't call
 * Resend -- so no single RPC owns this; direct table reads instead, same
 * as the rest of this file's `used`/`revealed`-style facts). Deliberately
 * filters out `evaluator_category = 'self'` in application code, not via
 * `.neq()` in the query: `evaluator_category` is `null` for every ad-hoc
 * invitation (it's a cycle-only concept, supabase/migrations/
 * 0005_ad_hoc_feedback_flow.sql never sets it), and PostgREST's `neq`
 * compiles to SQL `<>`, which drops `null` rows under 3-valued logic --
 * that would have silently excluded every ad-hoc invitee from ever
 * getting an email, the exact opposite of this story's point. Returns
 * `null` only if the request itself doesn't exist (unreachable in
 * practice -- always called right after that request's own successful
 * creation).
 */
export async function getInvitationEmailContext(requestId: string): Promise<InvitationEmailContext | null> {
  const supabase = await createClient();

  const { data: request, error: requestError } = await supabase
    .from("feedback_requests")
    .select("requester_member_id")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) return null;

  const { data: requester, error: requesterError } = await supabase
    .from("members")
    .select("full_name, email")
    .eq("id", request.requester_member_id)
    .maybeSingle();
  if (requesterError) throw new Error(requesterError.message);

  const { data: invitations, error: invitationsError } = await supabase
    .from("feedback_invitations")
    .select("token, invitee_email, evaluator_category, members(email)")
    .eq("feedback_request_id", requestId);
  if (invitationsError) throw new Error(invitationsError.message);

  const rows = (invitations as unknown as RawInvitationRow[] | null) || [];
  const recipients: InvitationRecipient[] = rows
    .filter((row) => row.evaluator_category !== "self")
    .map((row) => ({ token: row.token, email: row.invitee_email || row.members?.email || "" }))
    .filter((r) => r.email !== "");

  return {
    requesterName: requester?.full_name || requester?.email || "Alguien",
    recipients,
  };
}
