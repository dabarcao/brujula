import Link from "next/link";
import { redirect } from "next/navigation";
import ResponderWizard, { ClearResponderDraft } from "@/components/ResponderWizard";
import ResponderIntroGate from "@/components/ResponderIntroGate";
import * as responderManager from "@/server/managers/responderManager";
// Story 7.6: `getPlatformText` is an existing feedbackManager export --
// read-only import, no edit to that file (owned by a parallel story right
// now). `responder_intro` is its own platform_texts row (supabase/
// migrations/0087_responder_intro_text.sql), same mechanism as every other
// editable text in this app.
import { getPlatformText } from "@/server/managers/feedbackManager";
import Card from "@/components/ui/Card";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { buttonSecondaryClassName } from "@/components/ui/ButtonSecondary";

type Question = {
  id: string;
  prompt: string;
  required: boolean;
  question_type: string;
  max_selections: number | null;
};

type ScaleLevel = {
  level: number;
  label: string;
};

type CompetencyOption = {
  code: string;
  name: string;
};

type ResponderContext = {
  valid: boolean;
  used?: boolean;
  requires_login?: boolean;
  is_self?: boolean;
  questions?: Question[];
  scale_levels?: ScaleLevel[];
  competencies?: CompetencyOption[];
};

export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  let ctx: ResponderContext | null;

  // Una invitación por email (cuenta individual, sin ningún miembro
  // registrado detrás) no exige sesión: el token es la única credencial.
  // Una invitación normal sí la exige — get_responder_context devuelve
  // requires_login en ese caso si nadie ha iniciado sesión, o si la
  // sesión iniciada no es la de esa persona.
  try {
    const result = await responderManager.getContext(token);
    ctx = {
      valid: result.valid,
      used: result.used,
      requires_login: result.requiresLogin,
      is_self: result.isSelf,
      questions: result.questions?.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        required: q.required,
        question_type: q.questionType,
        max_selections: q.maxSelections,
      })),
      scale_levels: result.scaleLevels,
      competencies: result.competencies,
    };
  } catch {
    // A malformed token (not UUID-shaped) makes the RPC throw via
    // db/responder.ts's error convention -- fall through to invalid.
    ctx = null;
  }

  if (ctx?.requires_login) {
    redirect("/login");
  }

  if (!ctx || !ctx.valid) {
    return (
      <main className="flex-1 flex items-center justify-center p-6 bg-paper">
        <Card className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-ink mb-2">No encontrada</h1>
          <p className="text-sm text-ink-soft mb-4">
            Esta invitación no existe o no te pertenece.
          </p>
          <Link href="/dashboard" className={buttonSecondaryClassName}>
            Volver al panel
          </Link>
        </Card>
      </main>
    );
  }

  if (ctx.used) {
    // spec-4-4 post-review patch (fix #1): this branch is reached only
    // after the server itself confirms `used` -- either a real successful
    // submission just redirected back here (see submitFeedbackResponse,
    // src/app/actions/feedback.ts), or the token was already used on a
    // prior visit. Either way it is never reached by a rejected/failed
    // submission (that redirects back with `used` still false and renders
    // the wizard instead). <ClearResponderDraft> clears this token's
    // localStorage draft only from here, never from the wizard's own
    // submit handler -- see ResponderWizard.tsx's own comment on why.
    return (
      <main className="flex-1 flex items-center justify-center p-6 bg-paper">
        <ClearResponderDraft token={token} />
        <Card className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-ink mb-2">Ya has respondido</h1>
          <p className="text-sm text-ink-soft mb-4">Gracias por tu feedback.</p>
          <Link href="/dashboard" className={buttonSecondaryClassName}>
            Volver al panel
          </Link>
        </Card>
      </main>
    );
  }

  const isSelf = Boolean(ctx.is_self);
  const questions = ctx.questions || [];
  const scaleLevels = ctx.scale_levels || [];
  const competencies = ctx.competencies || [];

  // Never shown for the self-assessment -- the intro text is written for
  // "someone evaluating another person" specifically (see its own
  // platform_texts content), which doesn't apply to it.
  const introText = !isSelf
    ? await getPlatformText(
        "responder_intro",
        "**Antes de dar tu feedback**\n\nTu respuesta es completamente anónima."
      )
    : null;

  const wizard = (
    <ResponderWizard
      token={token}
      questions={questions}
      scaleLevels={scaleLevels}
      competencies={competencies}
    />
  );

  return (
    <main className="flex-1 p-4 sm:p-8 max-w-xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h1 className="text-2xl font-semibold text-ink">
          {isSelf ? "Tu autoevaluación" : "Dar feedback"}
        </h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft shrink-0">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-ink-soft mb-6">
        {isSelf
          ? "Esta es tu propia valoración: no es anónima, es tu punto de vista."
          : "Tu respuesta es anónima: ni la persona que la solicitó ni nadie más podrá saber que la escribiste tú."}
      </p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Card>
        {introText ? <ResponderIntroGate introText={introText}>{wizard}</ResponderIntroGate> : wizard}
      </Card>
    </main>
  );
}
