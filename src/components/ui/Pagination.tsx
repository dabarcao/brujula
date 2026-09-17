import Link from "next/link";
import { buttonSecondaryClassName } from "@/components/ui/ButtonSecondary";

// Pagination (Story 6.1 -- _bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): first reusable
// pagination primitive in the codebase. URL-driven (`?page=N`), no client
// state -- pairs with a Server Component page that reads `page` from
// `searchParams` and re-fetches server-side, so Prev/Next are plain
// navigation links, not buttons with onClick handlers.
//
// Envoltorio puro: sin "use client" y sin imports de datos/manager/
// Supabase (AD-11 -- shared UI primitives are presentation-only), para
// poder usarse también desde Server Components. The caller owns the base
// URL/search params and just tells this component which page it's on and
// how many pages exist in total.
//
// Renders nothing when there's nothing to page through (`totalPages <= 1`)
// -- callers don't need to guard the single-page/empty-list case
// themselves.
//
// Prev/Next follow ButtonSecondary.tsx's own documented convention for
// styling a `<Link>` identically to the button without nesting a
// `<button>` inside the `<a>` that `Link` renders: `buttonSecondaryClassName`
// on the `<Link>` itself. At a disabled boundary (first/last page) it
// renders a non-interactive `<span>` with the same classes instead of a
// `<Link>`, rather than a `<Link>` to the same page or a disabled anchor.
export type PaginationProps = {
  /** Current page, 1-indexed. */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Builds the href for a given page number, e.g. `(p) => \`/admin?page=${p}\`` -- the caller owns the base path and any other search params to preserve. */
  buildHref: (page: number) => string;
  className?: string;
};

export default function Pagination({ page, totalPages, buildHref, className = "" }: PaginationProps) {
  if (totalPages <= 1) return null;

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <nav
      aria-label="Paginación"
      className={["flex items-center justify-center gap-4 text-sm", className].filter(Boolean).join(" ")}
    >
      {isFirstPage ? (
        <span
          role="button"
          aria-disabled="true"
          className={[buttonSecondaryClassName, "opacity-50 cursor-not-allowed"].join(" ")}
        >
          Anterior
        </span>
      ) : (
        <Link href={buildHref(page - 1)} className={buttonSecondaryClassName}>
          Anterior
        </Link>
      )}

      <span className="text-ink-soft">
        Página {page} de {totalPages}
      </span>

      {isLastPage ? (
        <span
          role="button"
          aria-disabled="true"
          className={[buttonSecondaryClassName, "opacity-50 cursor-not-allowed"].join(" ")}
        >
          Siguiente
        </span>
      ) : (
        <Link href={buildHref(page + 1)} className={buttonSecondaryClassName}>
          Siguiente
        </Link>
      )}
    </nav>
  );
}
