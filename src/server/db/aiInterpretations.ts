// Story 1.2 (_bmad-output/implementation-artifacts/
// spec-1-2-db-access-manager-scaffolding-report-groups.md): db-access layer
// for the report-group AI interpretation step (spec.md sección 17). Split
// out of src/lib/aiInterpretation.ts's `generateReportGroupInterpretation`
// (unmodified by this story) -- its only RPC call
// (`get_report_group_competency_summary`) already lives in
// `@/server/db/reportGroups`, re-exported here rather than duplicated, per
// the spec's own instruction. `save_report_group_interpretation` (called by
// `closeReportGroup` itself, not by `generateReportGroupInterpretation`) is
// new to this file.
//
// Story 7.3: extended with the profile (individual 360) side of AI
// interpretation, closing src/lib/aiInterpretation.ts's `generateAiInterpretation`
// ESLint exemption (see eslint.config.mjs's now-removed `actions/cycles.ts`
// block). The 4 read RPCs that prompt used
// (get_request_competency_comparison/get_request_competency_by_category/
// get_request_saboteadores, plus the `feedback_answers` open-text read)
// already had typed wrappers in `@/server/db/feedback` -- reused here, not
// duplicated (that file's own header explains why they landed there:
// same requester-only access check as getRequestCompetencyNarrative). Only
// the 2 genuinely new reads/writes for this story -- the saved 3-part
// interpretation itself, and persisting a freshly generated one -- are
// added below.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getReportGroupCompetencySummary, getReportGroupOpenAnswers } from "@/server/db/reportGroups";

export type { ReportGroupCompetencySummaryRow, ReportGroupOpenAnswerRow } from "@/server/db/reportGroups";
export { getReportGroupCompetencySummary, getReportGroupOpenAnswers };

/**
 * Wraps `save_report_group_interpretation`. `openPatternsText` is optional
 * (0106_report_group_open_patterns.sql's `p_open_patterns_text` default
 * null keeps it a no-op on the stored column when omitted -- e.g. a group
 * whose open-text corpus was empty, generateReportGroupInterpretation
 * never asked the model for a patterns section at all). Throws the RPC's
 * own message on failure.
 */
export async function saveReportGroupInterpretation(
  groupId: string,
  text: string,
  openPatternsText?: string | null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_report_group_interpretation", {
    p_group_id: groupId,
    p_text: text,
    p_open_patterns_text: openPatternsText ?? null,
  });
  if (error) throw new Error(error.message);
}

export type SavedProfileInterpretation = {
  competencias: string | null;
  saboteadores: string | null;
  resumenAbiertas: string | null;
};

type RawSavedProfileInterpretation = {
  ai_interpretation: string | null;
  ai_saboteadores_text: string | null;
  ai_open_answers_text: string | null;
};

/**
 * Wraps the `feedback_requests` read that dashboard/feedback/[id]/page.tsx
 * needs to render the 3-part AI interpretation next to each report
 * section (migration 0077_ai_interpretation_split_three_parts.sql's 3
 * columns: `ai_interpretation` itself holds the competencias part, the
 * other 2 are new). Direct table read, no RPC -- same RLS as the rest of
 * `feedback_requests` (organization-scoped, not per-requester; see
 * `getRequestCompetencyComparison`'s own doc comment in db/feedback.ts),
 * so the caller is responsible for its own ownership check, exactly as
 * that file's callers already are. Returns `null` when no row is visible.
 */
export async function getSavedProfileInterpretation(requestId: string): Promise<SavedProfileInterpretation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_requests")
    .select("ai_interpretation, ai_saboteadores_text, ai_open_answers_text")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as RawSavedProfileInterpretation | null;
  if (!row) return null;
  return {
    competencias: row.ai_interpretation,
    saboteadores: row.ai_saboteadores_text,
    resumenAbiertas: row.ai_open_answers_text,
  };
}

/**
 * Wraps `save_ai_interpretation` with its full 3-argument signature
 * (migration 0077, `save_ai_interpretation(p_request_id, p_text,
 * p_saboteadores_text, p_open_answers_text)`) -- the profile-interpretation
 * sibling of `saveReportGroupInterpretation` above. Deliberately a new
 * wrapper rather than widening `db/cycles.ts`'s existing single-argument
 * `saveAiInterpretation` (out of this story's file scope; that function's
 * own doc comment already documents it as a narrow, 1-argument RPC call
 * matching the original unmigrated call site exactly) -- both wrap the
 * same RPC, callable independently. Throws the RPC's own message on
 * failure, standard db-layer convention (unlike db/cycles.ts's version,
 * which deliberately preserves a legacy swallowed-error quirk this new
 * call site doesn't inherit -- aiInterpretationManager.saveProfileInterpretation
 * is the layer that decides whether a save failure should be silent).
 */
export async function saveProfileInterpretation(
  requestId: string,
  competencias: string,
  saboteadores: string | null,
  resumenAbiertas: string | null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_ai_interpretation", {
    p_request_id: requestId,
    p_text: competencias,
    p_saboteadores_text: saboteadores,
    p_open_answers_text: resumenAbiertas,
  });
  if (error) throw new Error(error.message);
}
