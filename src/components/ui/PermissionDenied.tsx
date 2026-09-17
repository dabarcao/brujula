import Link from "next/link";
import { buttonSecondaryClassName } from "@/components/ui/ButtonSecondary";

// PermissionDenied: extracted from the identical inline permission-denied
// <main> block that was copy-pasted 3x across /admin, /admin/empresas/[id]
// and /dashboard/members (spec-4-1-admin-members-screens-redesign.md).
// Plain-language message, no red, ButtonSecondary-styled link back to
// /dashboard -- a <Link> can't wrap a <button> (see ButtonPrimary.tsx's own
// comment on the same constraint), so this uses `buttonSecondaryClassName`
// instead of nesting.
//
// Envoltorio puro: sin "use client" y sin imports de datos, para poder
// usarse también desde Server Components.
export default function PermissionDenied({ message }: { message: string }) {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center flex flex-col items-center gap-4">
        <p className="text-sm text-ink">{message}</p>
        <Link href="/dashboard" className={buttonSecondaryClassName}>
          Volver al panel
        </Link>
      </div>
    </main>
  );
}
