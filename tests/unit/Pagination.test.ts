// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): isolated coverage for
// src/components/ui/Pagination.tsx's own render logic, independent of any
// database state -- specifically closes the spec's I/O matrix rows that
// tests/integration/admin-organizations-pagination.test.ts's own header
// explains it cannot exercise against the shared, only-growing local
// Supabase database ("empty org set" / "single page (<=24 orgs)"): both
// collapse to `totalPages <= 1` from this component's point of view, which
// is deterministic and needs no fixture data at all.
//
// `.ts`, not `.tsx`, and the component is called as a plain function
// (`Pagination({...})`) rather than JSX -- vitest.config.ts's `include`
// only matches `tests/**/*.test.ts` (no React/JSX plugin configured
// either), same technique tests/integration/admin-organizations-
// pagination.test.ts already uses to render AdminPage().

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Pagination from "@/components/ui/Pagination";

describe("Pagination", () => {
  test("totalPages 0 (empty org set) -> renders nothing", () => {
    const html = renderToStaticMarkup(
      Pagination({ page: 1, totalPages: 0, buildHref: (p) => `/admin?page=${p}` })
    );
    expect(html).toBe("");
  });

  test("totalPages 1 (single page, <=24 orgs) -> renders nothing", () => {
    const html = renderToStaticMarkup(
      Pagination({ page: 1, totalPages: 1, buildHref: (p) => `/admin?page=${p}` })
    );
    expect(html).toBe("");
  });

  test("totalPages 2, page 1 -> Anterior disabled (span), Siguiente active (link)", () => {
    const html = renderToStaticMarkup(
      Pagination({ page: 1, totalPages: 2, buildHref: (p) => `/admin?page=${p}` })
    );
    expect(html).toMatch(/<span[^>]*>Anterior<\/span>/);
    expect(html).toMatch(/<a[^>]*href="\/admin\?page=2"[^>]*>Siguiente<\/a>/);
    expect(html).toContain("Página 1 de 2");
  });

  test("totalPages 2, page 2 -> Anterior active (link), Siguiente disabled (span)", () => {
    const html = renderToStaticMarkup(
      Pagination({ page: 2, totalPages: 2, buildHref: (p) => `/admin?page=${p}` })
    );
    expect(html).toMatch(/<a[^>]*href="\/admin\?page=1"[^>]*>Anterior<\/a>/);
    expect(html).toMatch(/<span[^>]*>Siguiente<\/span>/);
    expect(html).toContain("Página 2 de 2");
  });
});
