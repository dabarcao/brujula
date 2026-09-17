// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): covers the spec's own
// I/O & Edge-Case Matrix against a real, local `supabase start` instance --
// same discipline every other admin/members/auth suite in this repo uses.
//
// What's real: the extended `list_organizations()` RPC (supabase/
// migrations/0067) and `src/app/admin/page.tsx` itself, called directly as
// a plain async function -- the same "DashboardPage()-called-directly"
// technique tests/integration/admin-members-auth-flag-toggle.test.ts and
// tests/integration/read-only-reports-thin-delegate.test.ts already
// established for Server Components, here paired with
// `react-dom/server`'s `renderToStaticMarkup` (same pairing as the latter)
// so Prev/Next enabled/disabled state, the badge total, and which
// organizations actually rendered can be asserted from real output, not
// just "which RPC fired". What's mocked, and why: only
// `@/lib/supabase/server` (so this suite can render the page "as" the
// seeded platform admin or a non-admin without a real login/cookie
// ceremony per call, same as every other file in this admin/members/auth
// family) -- `next/headers` and `next/navigation` are NOT mocked: none of
// the scenarios below pass `?created=` (the only branch that calls
// `headers()`) or reach the `redirect("/login")` branch (every call here
// is made with a real, already-authenticated session).
//
// Organizations accumulate in this shared local database across every
// suite in this repo (nothing here or elsewhere deletes an organizations
// row), so this file never asserts against a hardcoded total -- it always
// derives its expectations from a `list_organizations` call made
// immediately adjacent to the assertion under test, the same
// fetch-then-compare pattern every other characterization suite in this
// repo already uses. It does, however, top up the organization count in
// `beforeAll` (via the real `create_organization_as_admin` RPC -- there is
// no platform-admin INSERT policy on `organizations` itself, by design) to
// guarantee at least 100 organizations exist, satisfying the spec matrix's
// own ">72 orgs exist" precondition for its mid-range-page row. The
// "empty org set" and "single page (<=24 orgs)" matrix rows are NOT
// exercised here for the same reason: this shared database only grows, so
// that state can't be constructed without destructively deleting other
// suites' fixtures. Both are covered by inspection instead: `Pagination`'s
// own unconditional `if (totalPages <= 1) return null;` guard
// (src/components/ui/Pagination.tsx), and the unmodified
// `orgList.length === 0` ternary already in `admin/page.tsx` before this
// story.

import { beforeAll, describe, expect, test, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const PASSWORD = "kairos123";
// Exactly one seeded row in platform_admins (supabase/migrations/
// 0016_platform_admin_org_creation.sql) -- there is no other way to
// exercise list_organizations()'s platform-admin success path.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";
const PAGE_SIZE = 24;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}
if (!process.env.APP_TOKEN_SECRET) {
  throw new Error(
    "Falta APP_TOKEN_SECRET -- debe venir de .env.test.local (spec-1-4-app-token-issuance-and-validation.md)."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why.
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null }));

function actingAs(token: string) {
  acting.token = token;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.token) {
      throw new Error("test bug: actingAs(token) must be called before invoking AdminPage");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${acting.token}` } },
    });
  },
}));

// Imported after the mock above (Vitest hoists `vi.mock` regardless of
// source order) so admin/page.tsx's own import of @/lib/supabase/server
// picks up the mocked client factory.
import AdminPage from "@/app/admin/page";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// tests/characterization/admin-members-auth.test.ts.
// ---------------------------------------------------------------------------

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function signUpOrSignIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok && data.access_token) return data.access_token as string;
  return login(email, password);
}

async function callRpc(name: string, token: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`RPC ${name} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

type RawOrg = {
  id: string;
  name: string;
  created_at: string;
  supervisor_email: string | null;
  supervisor_status: string | null;
  total_count: number | string;
};

async function fetchPage(token: string, limit: number | null, offset: number): Promise<RawOrg[]> {
  return (await callRpc("list_organizations", token, { p_limit: limit, p_offset: offset })) as RawOrg[];
}

async function renderAdminPage(searchParams: Record<string, string>): Promise<string> {
  const element = (await AdminPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement;
  return renderToStaticMarkup(element);
}

/** Finds the Prev/Next control by its exact label text and reports whether
 * it rendered as a live `<a>` link or a disabled, non-interactive `<span>`
 * (Pagination.tsx's own documented convention -- never a disabled/self
 * `<Link>`). */
function findControl(html: string, label: "Anterior" | "Siguiente"): { tag: "a" | "span"; full: string } {
  const match = html.match(new RegExp(`<(a|span)[^>]*>${label}</\\1>`));
  if (!match) throw new Error(`"${label}" control not found in rendered output`);
  return { tag: match[1] as "a" | "span", full: match[0] };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const runId = Date.now();
let platformAdminToken: string;
let nonAdminToken: string;

beforeAll(async () => {
  platformAdminToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
  nonAdminToken = await signUpOrSignIn(
    `pagination-non-admin-${runId}@brujula-fake.test`,
    PASSWORD
  );

  // Top up to at least 100 organizations so the matrix's own ">72 orgs
  // exist" mid-range-page precondition holds regardless of what other
  // suites have (or haven't yet) seeded into this shared local database --
  // see file header.
  const probe = await fetchPage(platformAdminToken, 1, 0);
  const currentTotal = probe.length > 0 ? Number(probe[0].total_count) : 0;
  const target = 100;
  const toCreate = Math.max(0, target - currentTotal);

  const BATCH = 10;
  for (let i = 0; i < toCreate; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, toCreate - i) }, (_, j) => i + j);
    await Promise.all(
      batch.map((n) =>
        callRpc("create_organization_as_admin", platformAdminToken, {
          p_org_name: `Pagination Seed ${runId}-${n}`,
          p_admin_email: `pagination-seed-${runId}-${n}@brujula-fake.test`,
          p_admin_full_name: null,
        })
      )
    );
  }
}, 120_000);

// ---------------------------------------------------------------------------
// RPC-level: ordering, slicing, total_count (supabase/migrations/0067)
// ---------------------------------------------------------------------------

describe("list_organizations pagination (RPC level)", () => {
  test("ordered by created_at desc, id desc across the full unpaginated set", async () => {
    const full = await fetchPage(platformAdminToken, null, 0);
    expect(full.length).toBeGreaterThanOrEqual(100);

    for (let i = 0; i < full.length - 1; i++) {
      // Postgres's timestamptz has microsecond precision; `Date.getTime()`
      // truncates to milliseconds and would falsely report ties that the
      // database itself broke by microseconds (seen locally: two rows
      // ~300us apart). Compare the raw ISO-8601 strings instead -- for a
      // single consistent serializer (PostgREST, same timezone for every
      // row here) that sorts identically to chronological order at full
      // precision.
      const a = full[i].created_at;
      const b = full[i + 1].created_at;
      if (a === b) {
        expect(full[i].id >= full[i + 1].id).toBe(true);
      } else {
        expect(a >= b).toBe(true);
      }
    }
  });

  test("p_limit/p_offset produce disjoint slices matching the full ordered set", async () => {
    const full = await fetchPage(platformAdminToken, null, 0);

    for (const pageIndex of [0, 1, 2]) {
      const slice = await fetchPage(platformAdminToken, PAGE_SIZE, pageIndex * PAGE_SIZE);
      const expectedIds = full.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE).map((o) => o.id);
      expect(slice.map((o) => o.id)).toEqual(expectedIds);
      expect(Number(slice[0]?.total_count)).toBe(full.length);
    }
  });

  test("non-admin caller with explicit p_limit/p_offset -> empty array, no error, no fabricated total_count", async () => {
    const rows = await fetchPage(nonAdminToken, PAGE_SIZE, 0);
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Page level: src/app/admin/page.tsx, rendered directly
// ---------------------------------------------------------------------------

describe("AdminPage pagination (page level)", () => {
  test("default load (no ?page=) -> first PAGE_SIZE orgs, badge shows the true total count", async () => {
    actingAs(platformAdminToken);
    const expected = await fetchPage(platformAdminToken, PAGE_SIZE, 0);
    const total = Number(expected[0]?.total_count ?? 0);

    const html = await renderAdminPage({});

    expect(html).toContain(`Vista agregada — ${total} empresas`);
    for (const org of expected) expect(html).toContain(org.name);
    expect(html).toContain("Página 1 de");

    expect(findControl(html, "Anterior").tag).toBe("span"); // disabled: first page
    const next = findControl(html, "Siguiente");
    expect(next.tag).toBe("a");
    expect(next.full).toContain('href="/admin?page=2"');
  });

  test("mid-range page (?page=3, >72 orgs) -> disjoint 24-row slice, Prev and Next both active", async () => {
    actingAs(platformAdminToken);
    const expected = await fetchPage(platformAdminToken, PAGE_SIZE, 2 * PAGE_SIZE);
    expect(expected).toHaveLength(PAGE_SIZE); // guaranteed full page: >=100 seeded

    const html = await renderAdminPage({ page: "3" });

    for (const org of expected) expect(html).toContain(org.name);
    expect(html).toContain("Página 3 de");

    const prev = findControl(html, "Anterior");
    expect(prev.tag).toBe("a");
    expect(prev.full).toContain('href="/admin?page=2"');
    const next = findControl(html, "Siguiente");
    expect(next.tag).toBe("a");
    expect(next.full).toContain('href="/admin?page=4"');
  });

  test("last page -> partial or full final slice, Next disabled", async () => {
    actingAs(platformAdminToken);
    const probe = await fetchPage(platformAdminToken, 1, 0);
    const total = Number(probe[0]?.total_count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const expected = await fetchPage(platformAdminToken, PAGE_SIZE, (totalPages - 1) * PAGE_SIZE);

    const html = await renderAdminPage({ page: String(totalPages) });

    for (const org of expected) expect(html).toContain(org.name);
    expect(html).toContain(`Página ${totalPages} de ${totalPages}`);
    expect(findControl(html, "Siguiente").tag).toBe("span"); // disabled: last page
    expect(findControl(html, "Anterior").tag).toBe("a"); // active: not the first page (>100 orgs seeded)
  });

  test("out-of-range ?page= clamps to the last valid page instead of erroring or rendering an empty grid", async () => {
    actingAs(platformAdminToken);
    const probe = await fetchPage(platformAdminToken, 1, 0);
    const total = Number(probe[0]?.total_count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const expected = await fetchPage(platformAdminToken, PAGE_SIZE, (totalPages - 1) * PAGE_SIZE);

    const html = await renderAdminPage({ page: "999999" });

    expect(html).not.toContain("Todavía no hay empresas creadas.");
    for (const org of expected) expect(html).toContain(org.name);
    expect(html).toContain(`Página ${totalPages} de ${totalPages}`);
  });

  test("non-admin caller -> PermissionDenied, unchanged, regardless of ?page=", async () => {
    actingAs(nonAdminToken);
    const html = await renderAdminPage({ page: "2" });

    expect(html).toContain("No tienes acceso a esta sección.");
    expect(html).not.toContain("Vista agregada");
    expect(html).not.toContain("Página");
  });
});
