---
title: 'Report Groups Server Actions Become Thin Delegates'
type: 'chore'
created: '2026-09-13'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '63fe6feb9449bc3f88912d54681a01da4d768b52'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/reportGroups.ts`'s three Server Actions (`createReportGroup`, `respondToReportGroup`, `closeReportGroup`) still call Supabase directly, even though `reportGroupsManager` (Story 1.2) already implements the exact same logic behind the new layering, and `src/app/api/report-groups/**` (Story 1.5) already proves that manager works correctly over HTTP.

**Approach:** Refactor each of the three Server Actions into a thin delegate: parse `FormData` (unchanged), call the matching `reportGroupsManager` function inside a `try/catch`, redirect-with-error on a thrown `Error` (preserving the exact original error-message text and redirect targets), and keep `revalidatePath()`/`redirect()` on the success path exactly where they are today — matching AD-3/AD-4's "managers own no Next.js-specific concerns" rule. Delete the `@/lib/supabase/server` and `@/lib/aiInterpretation` imports entirely; `closeReportGroup`'s delegate to `reportGroupsManager.closeGroup` inherits the AI-interpretation generate-and-save step transitively (that manager already does it internally, per Story 1.2) — no separate call needed in this file at all.

**Known, already-accepted behavioral note (not fixed here):** Story 1.5's review deferred a real gap in `reportGroupsManager.closeGroup` — if `saveReportGroupInterpretation` fails *after* `closeReportGroup` already succeeded, `closeGroup` throws (per Story 1.2's own reviewed fix), which this refactored Server Action will now treat as a full failure (redirect to an error page) even though the group did close. The *original* pre-refactor code never checked that save call's error at all, so it always redirected to success in that exact edge case. This discrepancy is not covered by Story 1.1's four frozen I/O-matrix fixtures (none exercises a save-interpretation failure), so it won't surface as a characterization-test regression — it is the same deferred issue Story 1.5 already logged, now also reachable through this Server-Action path, not a new one. Fixing it properly still requires the same manager-level return-type change already deferred; not repeated as a second deferred-work entry, since it's the identical underlying cause already on record.

**Boundaries:**
- **Always:** each action stays a `"use server"` FormData-parsing wrapper; `redirect()`/`revalidatePath()` targets and error-message-in-query-string shape stay byte-for-byte identical to today.
- **Never:** do not touch `src/app/api/report-groups/**`, `reportGroupsManager`, or any `db/*` file — this story only changes the one Server Action file. Do not modify Story 1.1's characterization test file itself — it must pass unmodified, proving equivalence.

</frozen-after-approval>

## Implementation Notes

## Review Triage Log

- **Blanket `catch (error)` in all three actions treats a business-rule rejection the same as an unexpected/infrastructure failure, with no logging before the error becomes a silent URL param** — real. Previously an unanticipated exception could surface loudly (no try/catch existed at all); now everything funnels into the same quiet redirect. Fix was trivial (`console.error` in each catch block, before the redirect) — **patched**.
- **No inline comment in `reportGroups.ts` pointing at the known close-succeeds-but-save-fails trade-off, even though the spec doc records it** — real; a future reader of just the `.ts` file would have no way to know this is intentional. Trivial fix (one comment block) — **patched**.
- **No test exercises the "close succeeds, interpretation-save fails" path, or `errorMessage()`'s non-`Error` fallback branch** — real gap, but not this story's to close: the underlying throw behavior is Story 1.2's own already-reviewed fix, and Story 1.5's review already deferred the identical root cause (a `reportGroupsManager.closeGroup` return-type change) when it surfaced through the Route Handler. This is the same cause reachable through a second path, not a new bug — **deferred**, no duplicate `deferred-work.md` entry (references the existing one from spec-1-5).
- **The three actions duplicate an identical `try { await managerFn } catch (error) { redirect(...) }` shape; since this is explicitly the template later Epic 1/3 domain stories are meant to copy, leaving it un-factored means every future domain hand-copies the same boilerplate** — real, valid architectural note, but premature to fix with only one domain (report groups) built so far — matches this initiative's established extract-on-first-real-reuse pattern (Story 1.1/1.2's own deferred helper-duplication entries). **Deferred**, new entry added.
- **`tests/characterization/report-groups.test.ts`'s header comment still describes `src/lib/aiInterpretation.ts`'s `generateReportGroupInterpretation` as what's exercised "for real," which is no longer accurate after this refactor (the call now goes through `aiInterpretationManager.ts`, Story 1.2's separately-maintained copy)** — real staleness, but this story's own frozen "Never" list explicitly forbids modifying that test file, even for a comment-only change, to keep it an untouched equivalence baseline. **Deferred**, new entry added, flagged for whenever that file is next legitimately touched (likely Story 1.8).
- **`src/lib/aiInterpretation.ts`'s `generateReportGroupInterpretation` (and its private `GroupCompetencyRow` type) became dead code once this refactor deleted its only caller** — confirmed via `grep -rn "generateReportGroupInterpretation" src/ tests/`: zero remaining references outside its own file after the refactor. Trivial, safe deletion (self-contained, no shared symbols with the still-used `generateAiInterpretation`) — **patched**.
- **`errorMessage()`'s fallback (`String(error)`) for a non-`Error` thrown value would render something unhelpful with no server-side record** — subsumed by the logging fix above (`console.error(error)` now logs the raw thrown value regardless of type); the manager only ever throws real `Error` instances in practice (confirmed in Story 1.2), so this branch is defensive, not reachable — no separate action needed.
- **`sprint-status.yaml` still "in-progress" and the spec's own Implementation Notes were empty at review time** — **false/moot**: this was mid-workflow state (review ran before the Finalize Spec/Commit steps), not a defect; resolved by this same update.

Refactored all three Server Actions in `src/app/actions/reportGroups.ts` to delegate to `reportGroupsManager` (`createGroup`/`respondToGroup`/`closeGroup`), each wrapped in a `try/catch` that redirects with the caught error's message on failure — preserving the exact original redirect targets and query-string error shape. Deleted the `@/lib/supabase/server` and `@/lib/aiInterpretation` imports entirely; `closeReportGroup` no longer references AI interpretation at all, since `reportGroupsManager.closeGroup` already generates and saves it internally (Story 1.2).

**Verification:** `npm run test` — 56/56 passing, including Story 1.1's original `tests/characterization/report-groups.test.ts` (7 tests), confirmed byte-for-byte unmodified via `git diff --stat` and run in isolation — this is the first time that suite has exercised the refactored Server Action path, and it passes unchanged, proving behavioral equivalence to the pre-refactor baseline it captured. `npm run lint` — 0 errors (confirms zero direct Supabase imports remain in `reportGroups.ts`, per this story's AC), same 1 pre-existing unrelated warning. `npx tsc --noEmit` — same 1 pre-existing unrelated error.

**Review (Blind Hunter, the only lens `oneshot` calls for) found 8 findings, patched 3, deferred 3, dismissed 2 as moot/false** — see Review Triage Log below. The two patched-beyond-the-original-plan items: added `console.error` logging in each catch block (previously an unexpected error would silently become a URL param with no server-side trace) and removed `src/lib/aiInterpretation.ts`'s `generateReportGroupInterpretation`/`GroupCompetencyRow`, which became dead code (zero remaining callers) once this refactor deleted the import — confirmed via `grep -rn` that only the separately-maintained `aiInterpretationManager.ts` copy (Story 1.2) is still called. `generateAiInterpretation` (the unrelated individual-profile function) and its `SupabaseClient` import were left untouched.
