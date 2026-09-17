"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import ButtonPrimary from "@/components/ui/ButtonPrimary";

// Story 7.6 (epics.md, "Email Infrastructure (Resend) + Responder
// Intro/Finalize UX"), ported from dabarcao/brujula commit 255e265's
// src/components/ResponderIntroGate.tsx: a brief context screen shown
// before the questionnaire, only for someone evaluating another person
// (never for the self-assessment -- src/app/responder/[token]/page.tsx
// only renders this when `!isSelf`, same as upstream). Same pattern as
// the wizard's own step-gating: a client-side "started" flag, so nothing
// is lost/reset by revealing the form.
//
// `introText` follows the same **bold**/blank-line-separated-paragraphs
// convention as every other `platform_texts` row in this app -- rendered
// here with a small local formatter rather than importing
// `@/server/infra/email`'s `renderMarkdownLiteHtml` (that one returns
// HTML for an email; this needs React nodes for a page, not a string to
// dangerously-set).
export default function ResponderIntroGate({
  introText,
  children,
}: {
  introText: string;
  children: ReactNode;
}) {
  const [started, setStarted] = useState(false);

  if (started) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-sm text-ink-soft">
        <FormattedParagraphs text={introText} />
      </div>
      <div>
        <ButtonPrimary type="button" onClick={() => setStarted(true)}>
          Comenzar feedback
        </ButtonPrimary>
      </div>
    </div>
  );
}

function FormattedParagraphs({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i}>{formatBold(paragraph)}</p>
      ))}
    </>
  );
}

// Splits on **bold** markers and alternates plain/<strong> text nodes --
// no HTML parsing involved (unlike infra/email.ts's HTML-string sibling),
// so there's no injection risk to guard against here.
function formatBold(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
