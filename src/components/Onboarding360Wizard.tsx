"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";

// Story 7.5 (epics.md, "Onboarding360Wizard + Questionnaire Changes"),
// ported from dabarcao/brujula commit 0a5cd87's
// src/components/Onboarding360Wizard.tsx: a 3-step guided flow (contexto
// -> selección de evaluadores -> confirmación) around starting a 360,
// shared between the company flow (src/app/dashboard/cycles/nueva) and the
// individual one (src/app/dashboard/feedback/nueva-360).
//
// `introText`/`seleccionText`/`confirmacionText` follow the same
// **bold**/blank-line-separated-paragraphs convention as every other
// `platform_texts` row -- same local `FormattedParagraphs`/`formatBold`
// pattern Story 7.6's ResponderIntroGate already established for exactly
// this (src/components/ResponderIntroGate.tsx), reused here rather than
// factored into a shared file neither component originally needed.
//
// Unlike upstream, this repo's Server Actions
// (src/app/actions/cycles.ts's `createFeedbackCycle`/
// `createIndividualCycleRequest`) still redirect on completion instead of
// returning a result -- that mechanism is out of this story's file scope
// (see the story's own Boundaries) and callers pass their own page-local
// "use server" action instead (same manager calls, adapted to
// useActionState's (prevState, formData) => state shape) rather than the
// shared export. `action` below is typed against that shape, not against
// the shared exports' `(formData) => Promise<void>` signature.
export type WizardActionState = { error: string } | { success: true } | null;

export default function Onboarding360Wizard({
  introText,
  seleccionText,
  confirmacionText,
  action,
  alreadyDone = false,
  alreadyDoneContent,
  children,
}: {
  introText: string;
  seleccionText: string;
  confirmacionText: string;
  action: (prevState: WizardActionState, formData: FormData) => Promise<WizardActionState>;
  // Si el usuario ya tiene una solicitud abierta al cargar la página, se
  // muestra alreadyDoneContent en vez del asistente. Solo se lee UNA VEZ,
  // al montar (useState perezoso, no un efecto): al confirmar el paso 2,
  // Next.js vuelve a ejecutar el Server Component padre con datos frescos
  // (la respuesta de una Server Action de este framework trae, en la misma
  // ida y vuelta, tanto el resultado de la action como el RSC de la ruta
  // actual ya re-renderizado -- ver node_modules/next/dist/docs/01-app/
  // 02-guides/server-actions.md, "A single response carries data and UI"),
  // y ahora esa solicitud SÍ existe -- si volviéramos a leer alreadyDone en
  // cada render, ese refresco sustituiría el paso 3 (confirmación) por este
  // mensaje, justo el momento en que el usuario necesita ver el paso 3.
  alreadyDone?: boolean;
  alreadyDoneContent?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [skipToAlreadyDone] = useState(alreadyDone);
  const [step, setStep] = useState<"intro" | "seleccion">("intro");
  const [state, formAction, pending] = useActionState<WizardActionState, FormData>(action, null);

  // "confirmación" no es un paso que se guarde en el estado -- se deriva de
  // si la action ya tuvo éxito. Así, un solo éxito nunca se "revierte" a
  // pesar de que el resto del componente se re-renderice, y no hace falta
  // sincronizarlo con un efecto.
  const effectiveStep = state && "success" in state ? "confirmacion" : step;

  if (skipToAlreadyDone) {
    return <>{alreadyDoneContent}</>;
  }

  if (effectiveStep === "intro") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 text-sm text-ink-soft">
          <FormattedParagraphs text={introText} />
        </div>
        <div>
          <ButtonPrimary type="button" onClick={() => setStep("seleccion")}>
            Siguiente
          </ButtonPrimary>
        </div>
      </div>
    );
  }

  if (effectiveStep === "confirmacion") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 text-sm text-ink-soft">
          <FormattedParagraphs text={confirmacionText} />
        </div>
        <div>
          <ButtonPrimary type="button" onClick={() => router.push("/dashboard")}>
            Entendido, ir a mi panel
          </ButtonPrimary>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 text-sm text-ink-soft">
        <FormattedParagraphs text={seleccionText} />
      </div>
      {state && "error" in state && <ErrorBanner>{state.error}</ErrorBanner>}
      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0 m-0">
        {children}
      </fieldset>
    </form>
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
// no HTML parsing involved, so there's no injection risk to guard against
// here. Same behavior as ResponderIntroGate's own local `formatBold`.
function formatBold(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
