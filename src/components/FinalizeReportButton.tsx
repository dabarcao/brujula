"use client";

import ButtonPrimary from "@/components/ui/ButtonPrimary";

// Story 7.6 (epics.md, "Email Infrastructure (Resend) + Responder
// Intro/Finalize UX"), ported from dabarcao/brujula commit 255e265's
// src/components/FinalizeReportButton.tsx: wraps the existing "Finalizar
// informe" form (src/app/dashboard/feedback/[id]/page.tsx) with a native
// `window.confirm` -- finalizing is irreversible (it locks out anyone who
// hasn't answered yet), so this needs a real event handler to block the
// submit on cancel, which is why this is a Client Component rather than
// inline JSX in the page's Server Component.
export default function FinalizeReportButton({
  requestId,
  confirmMessage,
  action,
}: {
  requestId: string;
  confirmMessage: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <ButtonPrimary type="submit">Finalizar informe</ButtonPrimary>
    </form>
  );
}
