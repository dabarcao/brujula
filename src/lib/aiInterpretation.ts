// Story 7.3: this file used to hold `generateAiInterpretation` (the raw-
// SupabaseClient-taking helper that was the 3rd and last eslint.config.mjs
// `no-restricted-imports` exemption, src/app/actions/cycles.ts). That logic
// now lives in `@/server/db/aiInterpretations` (reads/writes) +
// `@/server/managers/aiInterpretationManager`'s `generateProfileInterpretation`
// (prompt-building, the Anthropic call, orchestration) -- see that
// manager's own file header for the full rationale. Only this label map
// survives here: it's plain presentation data (no Supabase, no business
// logic), still imported directly by dashboard/feedback/[id]/page.tsx (the
// raw data table of saboteadores, SaboteadoresReport) and by
// aiInterpretationManager's own prompt-building, same precedent as
// CompetencyRadar.tsx's GROUP_LABELS/GROUP_COLORS being imported straight
// from a page/component rather than re-exported through a manager.

// Sin vincular a ninguna competencia ni rol VACC a propósito (spec.md
// sección 15, mismo principio que Plenitud↔roles) — solo para mostrar el
// nombre legible del código guardado en survey_questions.saboteador_code.
export const SABOTEADOR_LABELS: Record<string, string> = {
  controlador: "Controlador",
  evitador: "Evitador",
  hiperracional: "Hiperracional",
  complaciente: "Complaciente",
  perfeccionista: "Perfeccionista",
};
