# Epic 5 Context: Legacy Retirement & Supabase-Removal Readiness Review

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Once all six domains are stable on the new `db → managers → API` path (Epic 1/3, fully complete), this epic retires the remaining old direct-Supabase code project-wide and formally evaluates the deferred RLS-to-application-code and Supabase-to-direct-Postgres work as a scoped future initiative (not built here — PRD Non-Goals). Closes the loop on the PRD's SM-1 north-star signal: zero feature flags, zero direct-Supabase imports under `src/app/**`/`src/components/**`. The user explicitly waived AD-10's "one full production cycle / 14 days" rollback-safety gate on 2026-09-16 before authorizing this epic to start — no domain had actually reached that gate yet.

## Stories

- Story 5.1: Delete Old Direct-Supabase Paths, Per Domain
- Story 5.2: Confirm the Import Boundary Holds at Zero Violations Repo-Wide
- Story 5.3: Supabase-Removal and RLS-Rewrite Readiness Review

## Requirements & Constraints

- Six domains, five flags: `USE_NEW_API_ADMIN_MEMBERS`, `USE_NEW_API_CYCLES`, `USE_NEW_API_FEEDBACK`, `USE_NEW_API_RESPONDER`, `USE_NEW_API_REPORTS`. Report-groups (Epic 1's POC) has no flag — its action file already has zero direct-Supabase calls, fully migrated, nothing for Story 5.1 to do there.
- For each remaining domain: delete the old code path, remove the flag entirely (not just default it on), and retire or convert that domain's characterization tests into permanent regression tests against the single remaining (new) path.
- End state: zero feature flags, zero direct-Supabase imports anywhere under `src/app/**`/`src/components/**` — this is the PRD's SM-1 signal, formally confirmed by Story 5.2's lint run, not assumed.
- The ESLint `no-restricted-imports` per-file exception block (~25 files, in `eslint.config.*`) is temporary scaffolding for the migration period — deleting that config block and confirming zero violations repo-wide is Story 5.2's own job, not Story 5.1's; Story 5.1 only deletes source code, it doesn't touch the lint config.
- Some pages check their domain's flag directly in a Server Component (not only inside a Server Action file) — verify each domain's actual current shape rather than assuming a uniform pattern before deleting.

## Technical Decisions

- Each domain's flag check lives in exactly one place today (its own thin-delegate Server Action or the relevant Server Component), per AD-10's "checked in exactly one place, never inside a manager" rule — deletion means collapsing that one `if (flag) {...} else {...}` down to just the `if` branch's body, un-indented, with the flag import/env read removed.
- `src/server/db/*` and `src/server/managers/*` are untouched by this epic — they're already the single implementation; only the callers (`src/app/**`) still branch.
- Characterization tests captured *current* (old-path) behavior as a baseline to verify the new path against during migration; once the old path is deleted, a characterization test asserting old-path-specific behavior either gets deleted (if the new-path-verification suite already covers the same assertion) or converted to run only against what remains.
- No new feature flag is introduced by this epic — it's the flag-removal epic.

## Cross-Story Dependencies

- Story 5.2 depends on Story 5.1 being complete for all six domains (it measures the *result* of 5.1 — a clean lint run — not something it can partially confirm mid-migration).
- Story 5.3 is independent of 5.1/5.2 — a documentation/assessment deliverable, not a code change, and can proceed in parallel or after.
- Given the real size of Story 5.1 (6 domains, ~25 files), split by domain into separate specs if the single-spec token/scope standard doesn't fit one cohesive goal — each domain's flag removal is independently shippable and testable on its own.
