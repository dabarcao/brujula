// Story 7.6 (epics.md, "Email Infrastructure (Resend) + Responder
// Intro/Finalize UX"): pure/no-op-path unit tests for
// src/server/infra/email.ts -- no Supabase, no HTTP, no Next.js request
// context needed, same rationale as tests/unit/app-token.test.ts.
//
// RESEND_API_KEY is never set anywhere in this repo's test/dev env (no
// .env.test.local/.env.local entry, mirroring ANTHROPIC_API_KEY's own
// absence) -- `sendEmail` is therefore only ever exercised here via its
// no-RESEND_API_KEY no-op path, at module-load time (the client is built
// once, at import, from `process.env.RESEND_API_KEY`). This proves the
// no-op path never throws and never blocks the caller; it does NOT prove
// a real email gets delivered -- that needs a real key and manual QA (see
// this story's own report).

import { describe, expect, test } from "vitest";
import { getSiteUrl, renderEmailHtml, renderMarkdownLiteHtml, sendEmail } from "@/server/infra/email";

describe("sendEmail (no RESEND_API_KEY configured)", () => {
  test("resolves without throwing -- silent no-op, never breaks the calling manager", async () => {
    await expect(
      sendEmail({ to: "nadie@brujula-fake.test", subject: "Asunto de prueba", html: "<p>Cuerpo</p>" })
    ).resolves.toBeUndefined();
  });
});

describe("getSiteUrl", () => {
  test("falls back to localhost when neither NEXT_PUBLIC_SITE_URL nor VERCEL_URL is set", () => {
    // Neither is set in this test env (see .env.test.local) -- asserting
    // the actual fallback rather than stubbing, since stubbing would only
    // prove the stub works, not this repo's real current behavior.
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});

describe("renderMarkdownLiteHtml", () => {
  test("splits blank-line-separated paragraphs into <p> tags and **bold** into <strong>", () => {
    const html = renderMarkdownLiteHtml("**Hola** mundo.\n\nSegundo párrafo.");
    expect(html).toBe("<p><strong>Hola</strong> mundo.</p>\n<p>Segundo párrafo.</p>");
  });

  test("escapes HTML-significant characters before applying bold -- a platform_texts row can never inject markup", () => {
    const html = renderMarkdownLiteHtml('<script>alert("x")</script>');
    expect(html).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
  });

  test("drops empty paragraphs (extra blank lines collapse away)", () => {
    const html = renderMarkdownLiteHtml("Uno.\n\n\n\nDos.");
    expect(html).toBe("<p>Uno.</p>\n<p>Dos.</p>");
  });
});

describe("renderEmailHtml", () => {
  test("wraps the body with a greeting, the CTA link/label, and a footer", () => {
    const html = renderEmailHtml({
      bodyHtml: "<p>Cuerpo.</p>",
      ctaLabel: "Dar mi feedback",
      ctaLink: "https://example.test/responder/abc",
    });

    expect(html).toContain("<p>Cuerpo.</p>");
    expect(html).toContain('href="https://example.test/responder/abc"');
    expect(html).toContain("Dar mi feedback");
    expect(html).toContain("Brújula");
  });
});
