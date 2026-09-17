import type { ReactNode } from "react";

// ErrorBanner: extracted from Story 2.6's own inline neutral-box pattern
// (src/app/dashboard/groups/[id]/page.tsx) -- border-line/text-ink, never
// red/coral. DESIGN.md reserves coral for a single energizing moment per
// screen, never for error/warning, and there was no dedicated alert
// component until this story needed the same box a 2nd time
// (spec-4-1-admin-members-screens-redesign.md).
//
// Envoltorio puro sobre <p> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
export default function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 rounded-brujula-md border border-line text-ink text-sm p-3">
      {children}
    </p>
  );
}
