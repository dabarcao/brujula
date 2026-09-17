---
title: Tech-currency review — ARCHITECTURE-SPINE.md (Brújula backend/GUI decoupling)
reviewed: architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md
date: 2026-09-11
method: package.json + node_modules ground truth, node_modules/next/dist/docs (Next 16.3.1 bundled docs), WebSearch/WebFetch
---

## Verdict

The Stack table's version claims are verified correct against the real repo (package.json and installed node_modules match exactly, so the "existing stack, not a new choice" claim holds), Vitest is confirmed as Next.js's own officially documented App Router test tool with one real documented limitation the spine's test plan should account for, and AD-5's cookie-based token design has an unaddressed CSRF gap relative to current best practice — nothing here blocks the spine, but two items (Vitest 5's just-released major-version churn, and the missing CSRF story) are worth a line each before the scaffolding epic starts.

## Findings

### High

**H1 — AD-5's httpOnly cookie token scheme has no stated CSRF mitigation, and cookie auth requires one.**
- Checked: AD-5 text ("first-party session token... httpOnly + Secure + SameSite=Lax cookie... mirrors the security properties of the cookie it replaces") against current web guidance on cookie- vs. bearer-token API auth.
- Source: web search on cookie/httpOnly session auth vs. bearer tokens and CSRF (multiple 2026 sources, converging consensus) — cookies are sent automatically by the browser, so any cookie-authenticated endpoint that performs a state change is CSRF-exposed unless mitigated; bearer tokens in an `Authorization` header are immune to CSRF by construction because nothing attaches them automatically.
- Gap: `SameSite=Lax` is real, meaningful mitigation (blocks the cookie on cross-site POST/PUT/DELETE and cross-site `fetch`/XHR, only rides along on top-level GET navigation) but is not a complete substitute for CSRF defense per current guidance — it doesn't cover misconfigured subdomains, doesn't protect a state-changing endpoint mistakenly exposed via GET, and older-browser/embedded-webview SameSite support is inconsistent. AD-5 asserts the cookie "mirrors the security properties of the cookie it replaces" (i.e., the existing Supabase session cookie) but doesn't state whether that existing cookie's CSRF exposure was ever evaluated either — so the mirroring claim may just be carrying an unaudited gap forward, not closing it.
- This is exactly the tradeoff AD-9/AD-6 elsewhere in the spine are careful about (not shipping unaudited security surface). AD-5 should either (a) explicitly note SameSite=Lax is the sole CSRF mitigation and that's an accepted risk for a single first-party same-origin consumer (defensible, since AD-4/Deferred both note there's currently only one first-party consumer), or (b) add an explicit CSRF-token check for state-mutating Route Handlers. Recommend making the choice explicit rather than leaving it implicit — it's a one-line addition to AD-5's `[ASSUMPTION]`.

### Medium

**M1 — Vitest 5.0.0 shipped 8 days before this spine was dated; the spine pins no version, so a fresh install pulls a very new major with real breaking changes.**
- Checked: `npm view`-style web search for Vitest's current release status.
- Source: Vitest's own blog (`vitest.dev/blog/vitest-5.html`, fetched directly) and release-tracking search results — Vitest 5.0.0 released 2026-09-03. It requires **Vite >= 6.4.0** and **Node.js >= 22.12.0**, and has breaking changes (`clearMocks` now defaults to `true`; unawaited async assertions now fail instead of warning; Browser Mode locators are strict by default).
- Reality check: this repo's installed Node is v22.22.1 (confirmed via `node -v`), which satisfies Vitest 5's floor — no blocker. But the spine's Stack table lists "Vitest — new addition — no test runner exists today" with no version pin at all. Given AD-8 depends on Vitest behaving predictably against a locally seeded Supabase instance, and v5 is 8 days old with a fresh set of default-behavior changes (e.g., auto-clearing mocks could silently change test behavior vs. examples/tutorials written against v4), the scaffolding epic should pin an explicit Vitest version (and note the Node ≥22.12 floor) rather than letting `npm install -D vitest` float to whatever is latest at scaffold time.

**M2 — Vitest's one documented real limitation (not a Turbopack issue) isn't accounted for in AD-8's test plan.**
- Checked: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` (Next 16.3.1's own bundled docs, read in full per this repo's AGENTS.md instruction) and `testing/index.md` in the same tree.
- Finding: Next.js's own docs state plainly: *"Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them... we recommend using E2E tests for `async` components."* Vitest is one of four tools (Cypress, Playwright, Vitest, Jest) Next.js documents for App Router testing — so it is still the current, officially-endorsed choice, not stale guidance. This is a real, current caveat, not training-data drift.
- Relevance to this spine: AD-8's planned integration tests target `db`/`managers`/Route Handlers (plain async TS functions, not React Server Components), so the documented limitation likely doesn't bite the layers this spine is migrating. But `src/app/**` pages *are* async Server Components under this architecture, and nothing in AD-8 says page-level rendering is out of scope — worth one sentence in the scaffolding epic making explicit that Vitest here is for `db`/`manager`/route-handler-level tests only, and that any future Server-Component-level testing needs Playwright/Cypress instead, so nobody discovers the limitation mid-epic.
- Correction to a search artifact: an earlier web search summary claimed "Vitest integration is indeed problematic with Next.js 16's Turbopack." I fetched the specific source it cited (oneuptime.com's Turbopack compatibility post) directly and it does not mention Vitest at all — the claim doesn't hold up under verification and is not included as a finding. (Noting this here so it isn't mistaken for a checked-and-confirmed item if this review is skimmed.) Vitest runs its own Vite-based pipeline independent of `next dev`/`next build`'s bundler, so Turbopack-vs-Vitest interaction is not the actual risk surface here — version churn (M1) and the async-Server-Component gap (this finding) are.

### Low

**L1 — Stack table version claim verified correct; flagging as a clean pass, not a gap.**
- Checked: spine's Stack table row-by-row against `/home/oski/workspace/kairosexperience/brujula-gui/package.json` **and** the actually-installed `node_modules/*/package.json` versions (not just the semver ranges) and `package-lock.json` presence.
- Result: exact match on every entry —
  | Package | Spine | package.json | Installed (node_modules) |
  |---|---|---|---|
  | next | 16.3.1 | 16.3.1 | 16.3.1 |
  | react / react-dom | 19.2.8 | 19.2.8 | 19.2.8 |
  | @supabase/ssr | ^0.12.4 | ^0.12.4 | 0.12.4 |
  | @supabase/supabase-js | ^2.112.3 | ^2.112.3 | 2.112.3 |
  | typescript | ^5 | ^5 | (satisfies ^5) |
  | tailwindcss | v4 | ^4 | (satisfies v4) |
  | eslint / eslint-config-next | ^9 / 16.3.1 | ^9 / 16.3.1 | 16.3.1 |
- The spine's claim that this is "existing stack, not a new choice" is accurate — nothing here was asserted from training data without checking; it matches the real, brownfield repo exactly. No action needed.

**L2 — Next.js 16 docs confirm Vitest is still current, first-party-documented tooling (not deprecated in favor of something else).**
- Checked: `node_modules/next/dist/docs/01-app/02-guides/testing/index.md` (Next 16.3.1's bundled docs) plus a web search for whether Next's own guidance has shifted.
- Result: Next 16's own docs list exactly four supported testing tools — Cypress, Playwright, Vitest, Jest — with no indication Vitest has been superseded or deprecated. No newer/different recommendation was found in web search either. This confirms AD-8's tool choice is current as of the repo's actual installed Next.js version, addressing the concern that a training-data-era recommendation might be stale under Next.js 16's documented breaking-changes posture (per this repo's own AGENTS.md warning).
