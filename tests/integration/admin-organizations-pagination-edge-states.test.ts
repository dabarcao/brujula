// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): covers the two I/O
// matrix rows tests/integration/admin-organizations-pagination.test.ts's
// own header explains it cannot exercise against the shared, real local
// Supabase instance -- "empty org set" and "single page (<=24 orgs)" --
// since that database only ever grows (nothing deletes an organizations
// row) and destructively wiping it would break every other suite's
// fixtures.
//
// Unlike that file, this one mocks @/lib/supabase/server with a fully
// in-memory fake client (no real Supabase instance involved at all), so
// the exact row count AdminPage sees is deterministic and controlled per
// test -- the only way to genuinely construct "0 organizations" or
// "5 organizations" against this page's own live database call.

import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

type FakeOrgRow = {
  id: string;
  name: string;
  created_at: string;
  supervisor_email: string | null;
  supervisor_status: string | null;
  total_count: number;
};

function makeFakeClient(orgs: FakeOrgRow[]) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "fake-admin-user" } } }),
    },
    rpc: async (name: string) => {
      if (name === "is_platform_admin") return { data: true };
      if (name === "list_organizations") return { data: orgs };
      throw new Error(`unexpected rpc in fake client: ${name}`);
    },
  };
}

let fakeOrgs: FakeOrgRow[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeFakeClient(fakeOrgs),
}));

// Imported after the mock above (Vitest hoists `vi.mock` regardless of
// source order) so admin/page.tsx's own import of @/lib/supabase/server
// picks up the fake client factory.
import AdminPage from "@/app/admin/page";

async function renderAdminPage(searchParams: Record<string, string> = {}): Promise<string> {
  const element = (await AdminPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement;
  return renderToStaticMarkup(element);
}

describe("AdminPage, empty and single-page edge states (Story 6.1)", () => {
  test("0 organizations -> existing empty-state Card, no AggregateBadge, no Pagination", async () => {
    fakeOrgs = [];

    const html = await renderAdminPage();

    expect(html).toContain("Todavía no hay empresas creadas.");
    expect(html).not.toContain("Vista agregada");
    expect(html).not.toContain("Página");
  });

  test("5 organizations (<=24, single page) -> all render, no Pagination controls", async () => {
    fakeOrgs = Array.from({ length: 5 }, (_, i) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      name: `Fake Org ${i}`,
      created_at: new Date(2026, 0, i + 1).toISOString(),
      supervisor_email: null,
      supervisor_status: null,
      total_count: 5,
    }));

    const html = await renderAdminPage();

    expect(html).toContain("Vista agregada — 5 empresas");
    for (const org of fakeOrgs) expect(html).toContain(org.name);
    expect(html).not.toContain("Página");
    expect(html).not.toMatch(/>Anterior</);
    expect(html).not.toMatch(/>Siguiente</);
  });
});
