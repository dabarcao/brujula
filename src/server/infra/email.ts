// Story 7.6 (epics.md, "Email Infrastructure (Resend) + Responder
// Intro/Finalize UX"): the first `src/server/infra/*` file -- a new layer,
// documented as AD-12 in ARCHITECTURE-SPINE.md, for infrastructure-service
// integrations that don't fit `db/*` (no Supabase client, no RLS/
// authorization dimension) or `managers/*` (a manager orchestrates business
// logic *around* a side effect like this; it shouldn't construct the SDK
// client that performs the side effect itself). This file is deliberately
// the only place allowed to import the `resend` package -- see
// eslint.config.mjs's `no-restricted-imports` entry for `src/app/**`/
// `src/components/**`, mirroring how `@/server/db/*` is the only place
// allowed to import Supabase.
//
// Called only from a manager (AD-12) -- never from a page/Route Handler,
// never from `db/*`. Ported from the upstream reference's src/lib/email.ts
// + the generic half of src/lib/invitationEmails.ts (dabarcao/brujula
// commit 255e265), restructured: the Resend call and the two purely
// mechanical HTML-rendering helpers (markdown-lite -> HTML, the shared
// email envelope) live here; which platform_texts to use, who the
// recipients are, and the {nombre}/{enlace} substitution rules are
// business decisions that stay in `responderManager`/`cyclesManager`.
//
// Same graceful-degradation contract as `aiInterpretationManager`'s
// ANTHROPIC_API_KEY handling (src/server/managers/aiInterpretationManager.ts):
// no RESEND_API_KEY configured -> every export here silently no-ops,
// never throws -- the rest of the app (invitation creation, response
// submission) must keep working unchanged in an environment with no key
// configured, and activating real delivery is only ever an env var, never
// a code change.

import "server-only";
import { Resend } from "resend";

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_ADDRESS = "Brújula <notificaciones@brujula.kairos-experience.es>";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Sends one email via Resend. No RESEND_API_KEY -> no-op (see file header).
 * A Resend-reported error or a thrown exception (network failure, etc.) is
 * logged and swallowed, never re-thrown -- same contract as the original
 * `sendEmail` this was ported from: a failed email must never fail the
 * invitation/response flow that triggered it.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!resendClient) return;

  try {
    const { error } = await resendClient.emails.send({ from: FROM_ADDRESS, to, subject, html });
    if (error) {
      console.error(`infra/email: no se pudo enviar el email a ${to}:`, error);
    }
  } catch (e) {
    console.error(`infra/email: no se pudo enviar el email a ${to}:`, e);
  }
}

/**
 * Absolute site URL for links inside an email -- unlike normal Next.js
 * navigation, an email can't use a relative path. NEXT_PUBLIC_SITE_URL
 * wins when set (production, own domain); falls back to VERCEL_URL (what
 * Vercel exposes per deployment); falls back to localhost for dev.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Turns an editable `platform_texts` body (paragraphs separated by a blank
 * line, `**bold**` the only inline syntax -- same convention as the
 * wizard/report-narrative text elsewhere in this app) into safe HTML.
 * Escapes first so a `platform_texts` row can never inject arbitrary HTML
 * into an outbound email. Purely mechanical string formatting -- no
 * business meaning, which is why it lives here rather than in a manager.
 */
export function renderMarkdownLiteHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph);
      const bold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<p>${bold}</p>`;
    })
    .join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The one shared HTML envelope both the invitation and thank-you emails
 * use (ported verbatim in spirit from invitationEmailHtml/thankYouEmailHtml
 * upstream, unified here since the two were visually identical): a greeting,
 * the already-rendered body, one call-to-action button, and a footer.
 */
export function renderEmailHtml({
  bodyHtml,
  ctaLabel,
  ctaLink,
}: {
  bodyHtml: string;
  ctaLabel: string;
  ctaLink: string;
}): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p>Hola,</p>
      ${bodyHtml}
      <p style="margin: 32px 0;">
        <a
          href="${ctaLink}"
          style="background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;"
        >
          ${ctaLabel}
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">— Brújula</p>
    </div>
  `;
}
