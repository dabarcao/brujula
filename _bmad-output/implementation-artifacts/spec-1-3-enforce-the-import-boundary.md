---
title: 'Enforce the Import Boundary'
type: 'chore'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fd22e0d00053e18d4d01c1c39aa332500b556eae'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing today stops a page, component, or Server Action from importing `@/lib/supabase/*` or `@/server/db/*` directly — the `db → managers → API` layering Stories 1.1/1.2 introduced is currently just a convention, not a checkable fact. `src/app/**`/`src/components/**` also has 24 pre-existing files that still legitimately import `@/lib/supabase/*` directly (they haven't been migrated to the new layering yet — that's Epic 3's job, domain by domain), so the rule cannot simply forbid the import everywhere today without breaking the current build.

**Approach:** Add an ESLint `no-restricted-imports` rule (flat config, `eslint.config.mjs`) that forbids `@/lib/supabase/*` and `@/server/db/*` under `src/app/**` and `src/components/**`. Since 24 files there still call Supabase directly pending their own future migration story, add one clearly-labeled, temporary override block listing exactly those 24 files, re-permitting `@/lib/supabase/*` for them only (never `@/server/db/*` — nothing legacy imports that today, so it's forbidden everywhere with zero exceptions from day one). This is the incremental rollout the epics themselves already imply: Epic 5's closing story ("confirm the import boundary holds at zero violations repo-wide") only makes sense if the rule ships now with temporary exceptions that shrink as each domain migrates in Epic 3, reaching zero by Epic 5. Each existing `src/server/db/*` and `src/server/managers/*` file gets `import "server-only";` as its first line (new `server-only` package dependency) as defense in depth, so an accidental client-bundle import fails the build even if the lint rule is ever bypassed. Finally, prove the rule actually fires: add a scratch file that violates it, run lint, confirm the violation is reported, then delete the scratch file — this is a one-time verification step, not a lasting artifact.

## Boundaries & Constraints

**Always:**
- The `no-restricted-imports` rule's `@/server/db/*` restriction under `src/app/**`/`src/components/**` has zero exceptions — no legacy file imports it today, so this closes off a full new class of violation immediately and permanently.
- The `@/lib/supabase/*` exception list is exactly the 24 files identified in this story's Code Map (`git grep -l "@/lib/supabase" src/app src/components`) — no other files, and no wildcard/directory-level exemption that would silently exempt future new files too.
- Every file under `src/server/db/*` and `src/server/managers/*` (existing and any created in this story) opens with `import "server-only";` as its literal first import.
- The scratch violation used to prove the rule fires is created, shown to fail lint, and removed within this story — it must not be present in the final diff.

**Never:**
- Do not modify `src/app/actions/reportGroups.ts`, `src/lib/aiInterpretation.ts`, or any of the 24 legacy files' logic — this story only touches ESLint config, the `server-only` import line, and `package.json`/lockfile for the new dependency.
- Do not wire `src/server/managers/*` or `src/server/db/*` into any page, component, or Server Action in this story — that is Stories 1.5/1.6.
- Do not add the app-token/`requireApiToken()` mechanism (Story 1.4) or a Route Handler (Story 1.5) here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New file under `src/app/**` imports `@/server/db/reportGroups` | scratch violation file | `npm run lint` reports a `no-restricted-imports` violation | non-zero exit, violation message names the forbidden import |
| New file under `src/app/**` imports `@/lib/supabase/server` (not on the exception list) | scratch violation file | `npm run lint` reports a `no-restricted-imports` violation | non-zero exit |
| One of the 24 existing exception-listed legacy files (e.g. `src/app/actions/cycles.ts`) | unmodified, still imports `@/lib/supabase/server` | `npm run lint` passes with no new violation | N/A |
| `src/server/db/reportGroups.ts` / `aiInterpretations.ts` / `src/server/managers/reportGroupsManager.ts` / `aiInterpretationManager.ts` | existing Story 1.2 files, now with `import "server-only";` added | `npm run lint` and `npm run test` both still pass | N/A |

</frozen-after-approval>

## Code Map

- `eslint.config.mjs` — flat config using `defineConfig([...nextVitals, ...nextTs, globalIgnores([...])])`. New rule config objects get appended to this array; a later array entry's `rules` for matching `files` overrides an earlier entry's for the same rule, per ESLint flat-config semantics — so the exception block must come after the main restriction block for the same rule to apply correctly.
- `package.json` — add `"server-only"` to `dependencies` (it is a runtime-position marker package, conventionally listed as a dependency, not devDependency, in Next.js projects). No version pin research needed beyond `^0.0.1` (its actual latest — confirm via `npm view server-only version` during implementation).
- Files needing the 24-file `@/lib/supabase` exception list (confirmed via `grep -rl "@/lib/supabase" src/app src/components`): `src/app/actions/{admin,auth,cycles,feedback,members,reportGroups}.ts`, `src/app/admin/empresas/[id]/page.tsx`, `src/app/admin/page.tsx`, `src/app/dashboard/cycles/[id]/estado/page.tsx`, `src/app/dashboard/cycles/[id]/page.tsx`, `src/app/dashboard/cycles/nueva/page.tsx`, `src/app/dashboard/cycles/page.tsx`, `src/app/dashboard/feedback/[id]/gestionar/page.tsx`, `src/app/dashboard/feedback/[id]/page.tsx`, `src/app/dashboard/feedback/nueva-360/page.tsx`, `src/app/dashboard/feedback/nueva/page.tsx`, `src/app/dashboard/groups/[id]/page.tsx`, `src/app/dashboard/groups/nuevo/page.tsx`, `src/app/dashboard/groups/page.tsx`, `src/app/dashboard/informe-empresa/page.tsx`, `src/app/dashboard/members/page.tsx`, `src/app/dashboard/mi-mapa/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/invitacion/[token]/page.tsx`, `src/app/responder/[token]/page.tsx`.
- `src/server/db/reportGroups.ts`, `src/server/db/aiInterpretations.ts`, `src/server/managers/reportGroupsManager.ts`, `src/server/managers/aiInterpretationManager.ts` — the four Story 1.2 files needing `import "server-only";` added as their first import line.
- No `src/app/**`/`src/components/**` file currently imports `@/server/db/*` (confirmed via `grep -rl "@/server/db" src/app src/components` → no matches) — the restriction on it has no legacy exceptions to carve out.
- `_bmad-output/implementation-artifacts/spec-1-2-db-access-manager-scaffolding-report-groups.md` — prior story's Implementation Notes, loaded for continuity; explicitly deferred both the `server-only` import and the ESLint rule to this story.
- `_bmad-output/planning-artifacts/epics.md` Epic 5, Story 5.2 ("confirm the import boundary holds at zero violations repo-wide") — the evidence this story's exception-list design (rule ships now, shrinks over Epic 3, reaches zero by Epic 5) is the intended rollout shape, not an ad hoc workaround.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` / lockfile -- add `server-only` as a runtime dependency, `npm install`
- [x] `src/server/db/reportGroups.ts`, `src/server/db/aiInterpretations.ts`, `src/server/managers/reportGroupsManager.ts`, `src/server/managers/aiInterpretationManager.ts` -- add `import "server-only";` as the first import in each
- [x] `eslint.config.mjs` -- add a `no-restricted-imports` rule config object scoped to `files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"]` forbidding `@/lib/supabase/*` and `@/server/db/*`, followed by a second config object (later in the array, so it wins for matching files) scoped to exactly the 24 legacy files from the Code Map, re-permitting only `@/lib/supabase/*` there, with a comment explaining the exception is temporary and named by Epic 3's per-domain migration stories / removed for good by Epic 5 Story 5.2
- [x] Verification-only, not a lasting change: create a scratch file under `src/app/` importing `@/server/db/reportGroups`, run `npm run lint`, confirm it reports the violation, then delete the scratch file

**Acceptance Criteria:**
- Given the ESLint config, when `npm run lint` runs against the current tree (no legacy file modified), then it passes with the same pre-existing warning Story 1.2 recorded and no new violations.
- Given a scratch file under `src/app/**` importing `@/server/db/reportGroups` or `@/lib/supabase/server` (and not on the exception list), when `npm run lint` runs, then it reports a `no-restricted-imports` violation naming the forbidden import — proving the rule fires, not just exists — after which the scratch file is deleted and does not appear in the final diff.
- Given `src/server/db/*` and `src/server/managers/*`, when each file is opened, then its first import is `import "server-only";`.
- Given `npm run test`, when run after this story's changes, then all 14 existing tests (Story 1.1 + 1.2) still pass unchanged.

## Implementation Notes

**Count correction:** the frozen Intent/Code Map text says "24 legacy files"; the actual `grep -rl "@/lib/supabase" src/app src/components` result (and the exception list actually implemented) has **25** entries. The boundary text defines the exception list as exactly the grep result, so the implementation used the correct 25-file list; the "24" in the frozen prose is a miscount from this spec's own planning stage, not a functional gap (per triage rules, fixing the spec's prose count is out of scope for this review; the implemented list is the source of truth and has been independently re-verified against `grep -rl` below).

**ESLint mechanism, as built:** two flat-config objects appended after the existing `globalIgnores` entry. The first applies `no-restricted-imports` to all of `src/app/**/*.{ts,tsx}` and `src/components/**/*.{ts,tsx}`, forbidding both `@/lib/supabase/*` and `@/server/db/*`. The second, listed after it (flat-config: a later matching entry's `rules` fully replaces the earlier one's for the same rule key, not merges), targets exactly the 25 legacy files and re-declares `no-restricted-imports` with only the `@/server/db/*` pattern — so those files remain free to import `@/lib/supabase/*` (their existing behavior, unmodified) but are still newly blocked from ever importing `@/server/db/*`. Route-segment brackets (`[id]`, `[token]`) required escaping (`\\[id\\]`) in the glob strings since ESLint's minimatch otherwise reads them as character classes; this was caught by the scratch-violation step itself failing to detect anything wrong with those files before the fix, then confirmed fixed.

**Post-review patch (found by 3-lens review, applied after the Implementation Notes above were first written):** extended the `patterns`/`files` globs to cover relative-path imports, `@supabase/supabase-js` directly, nested paths (`*` → `**`), and `.js`/`.jsx`/`.mjs` files; added a bracket-escaping note to the exception-list comment; regenerated the `package-lock.json` `server-only` entry (the missing `license` field turned out to be an artifact of this environment's active npm 9.2.0 fetching abbreviated registry metadata — reproduced even for unrelated packages in an isolated scratch install — fixed by running the install via `npx npm@latest` instead). One further deviation this patch pass required: forbidding `@supabase/supabase-js` broke `src/app/dashboard/feedback/[id]/page.tsx`, one of the 25 legacy files, which has a pre-existing `import type { SupabaseClient } from "@supabase/supabase-js"` for a helper's parameter type. Added one more, narrower config block (later in the array, exact path only) re-permitting `@supabase/supabase-js` for that single file while keeping `@/server/db/**` forbidden for it — in scope under this story's own "Never touch legacy-file logic" rule, since the fix is ESLint config, not a code change to the legacy file. Full Review Triage Log below.

**Deviation from Code Map — `vitest.config.ts`:** not in the spec's original file list, but required: `server-only`'s package entrypoint throws unconditionally unless the bundler resolves its `react-server` export condition (Next.js's build does this; Vitest's default Node resolution does not). Added a `resolve.alias` mapping `"server-only"` to `node_modules/server-only/empty.js` (the same no-op Next.js itself uses for server-side code) so the four Story 1.2 files stay importable by the existing characterization tests. This was necessary to satisfy this story's own frozen acceptance criterion (`npm run test` unchanged, 14/14) once the `server-only` markers were added — judged in-scope as a test-infrastructure fix, not a change to any restricted business-logic file.

**Verification run (2026-09-12):**
- `npm run test` → 14/14 passing, unchanged from Story 1.2's baseline.
- `npm run lint` → 0 errors, same 1 pre-existing unrelated warning (`scripts/seed-company-360.mjs`). No new violations on any of the 25 legacy files or the four Story 1.2 server files.
- `npx tsc --noEmit` → same one pre-existing, unrelated error (`src/app/layout.tsx`, `Cannot find name 'LayoutProps'`).
- Scratch-violation proof: two temporary files under `src/app/` (one importing `@/server/db/reportGroups`, one importing `@/lib/supabase/server`, neither on the exception list) both produced `no-restricted-imports` errors on `npm run lint`; both deleted afterward, confirmed absent from `git status`.

## Spec Change Log

## Review Triage Log

- **Frozen prose says "24 legacy files," actual list/implementation has 25** — Blind Hunter finding 1, Edge Case Hunter finding 5 (claim). Verdict: **false**. Already documented in Implementation Notes as a miscount from this spec's own planning stage; the boundary text defines the exception list *as* the grep result, and the implemented 25-file list matches `grep -rl "@/lib/supabase" src/app src/components` exactly (independently re-verified). Fixing the frozen prose's count would mean editing this build's spec, which triage never does.
- **`sprint-status.yaml` still shows `1-3-...: in-progress`, not `review`, while the spec's own frontmatter says `in-review`** — Blind Hunter finding 2. Verdict: **false**. This is the expected mid-workflow state: step-05 (not yet reached) is what syncs sprint-status to `review`, exactly as it did for Stories 1.1/1.2 at this same point in their own lifecycle.
- **The rule only enumerates the aliased wrapper specifiers (`@/lib/supabase/*`, `@/server/db/*`), not a relative-path import to the same files (e.g. `../../../lib/supabase/server`) or a direct `@supabase/supabase-js` import** — Blind Hunter findings 3 & 4. Verdict: **low**. Real gap (confirmed no current file uses either bypass — all 25 legacy files use the `@/` alias, consistent with this repo's tsconfig-paths convention throughout), but the frozen spec's own scope (mirroring epics.md's Story 1.3 AC verbatim) only names `@/lib/supabase/*`/`@/server/db/*`, not "every path to the underlying module." Trivial, no-new-surface fix (extend the `patterns` array). Routes to **patch**.
- **`@/lib/supabase/*` and `@/server/db/*` group patterns use a single `*`, which (per the `ignore`-package gitignore-style matcher `no-restricted-imports.js` uses) only matches one extra path segment — a future nested import like `@/server/db/cycles/queries` would silently bypass the rule** — Edge Case Hunter findings 1 & 2. Verdict: **low**. Confirmed no nested paths exist today under `src/lib/supabase/*` or `src/server/db/*`/`managers/*` (both flat), and the epic's own established convention (`epic-1-context.md`: "one file per domain per layer, `db/<domain>.ts`") means future domains are expected to stay flat too — so this is currently unreachable, but the fix (`*` → `**`) is a one-character-per-pattern, zero-risk change. Routes to **patch**.
- **`files` glob only matches `*.{ts,tsx}` under `src/app/**`/`src/components/**`, not `.js`/`.jsx`/`.mjs`** — Edge Case Hunter finding 3. Verdict: **low**. Confirmed zero `.js`/`.jsx`/`.mjs` files exist anywhere under either tree today (this is a TypeScript-only codebase in practice) — currently unreachable, but the fix is a trivial glob extension. Routes to **patch**.
- **`no-restricted-imports` cannot catch a dynamic `import()` of the same forbidden specifiers** — Edge Case Hunter finding 4. Verdict: **low**. Verified directly against the installed `eslint@9.39.5`'s `no-restricted-imports.js` source: it listens only on `ImportDeclaration`/`ExportNamedDeclaration`/`ExportAllDeclaration`, never `ImportExpression` — a real, confirmed limitation of the rule itself. Rejected: no dynamic import of either module exists anywhere in this codebase (Next.js Server Components/Actions here use only static imports), and closing this gap needs a second, separate `no-restricted-syntax` rule with a custom AST selector — more than a direct correction for a risk with zero current exposure.
- **`src/lib/supabase/*` (the Supabase client wrapper itself) has no `server-only` guard, unlike the new `db`/`managers` files** — Blind Hunter finding 5. Verdict: **low**, real pre-existing gap. Rejected from action here: the frozen "Never" list explicitly scopes this story to the four named Story 1.2 files plus ESLint config/`package.json` — adding a guard to `src/lib/supabase/*` is outside that boundary, not something this story's own frozen scope permits touching. Routes to **defer**.
- **`package-lock.json`'s new `node_modules/server-only` entry is missing the `"license": "MIT"` field that every other small dependency in the same lockfile carries** — Blind Hunter finding 6. Verdict: **low**. Confirmed by comparing against `tslib`/`picocolors` entries in the same file (both have `license`) and the installed package's own `package.json` (does declare `"license": "MIT"`) — a genuine `npm install` run should have written it. Trivial fix (re-run `npm install`). Routes to **patch**.
- **Exception-list code comment in `eslint.config.mjs` doesn't mention the bracket-escaping gotcha (`\[id\]`) discovered during implementation** — Blind Hunter finding 7. Verdict: **low**. Real, and the fix (one comment line) is trivial. Routes to **patch**.
- **No lasting regression test proves the `no-restricted-imports` rule keeps working going forward — only a one-time scratch-file check that's deleted afterward** — Blind Hunter finding 8, Verification Gap main finding (independently reproduced: created and removed the same kind of scratch violation, confirmed it fires today). Verdict: **low**, real. Routes to **defer**: the frozen Tasks section explicitly calls this "a one-time verification step, not a lasting artifact" — a deliberate choice given this repo has no CI anywhere (confirmed: no `.github/workflows`, no active git hooks) to run a persisted test against; adding one now would be new test infrastructure that exceeds a patch-sized fix and would reverse an explicit frozen decision. Matches the architecture spine's own already-flagged open item ("whether/how to introduce CI... revisit before the POC is done").
- **`## Spec Change Log` is left empty despite Implementation Notes documenting real deviations (the vitest.config.ts addition, the 24-vs-25 count correction)** — Blind Hunter finding 9. Verdict: **false**. Per the workflow's own step-04 instructions, this section is populated only when a `bad_spec`-routed finding triggers a loopback that amends the frozen spec — general implementation deviations belong in Implementation Notes (where they are), not here. No bad_spec finding occurred in this review, so the section is correctly empty.

## Verification

**Commands:**
- `npm run lint` -- expected: passes cleanly (only the same pre-existing unrelated warning), and separately (scratch-violation step) reports the deliberate violation before it's removed
- `npm run test` -- expected: 14/14 passing, unchanged
- `npx tsc --noEmit` -- expected: no new type errors introduced
