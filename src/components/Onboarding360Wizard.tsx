"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FormattedParagraphs as Paragraphs } from "@/components/FormattedText";

type WizardActionState = { error: string } | { success: true } | null;

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
  // Firma de useActionState: (estado previo, formData) => nuevo estado. Se
  // pasa directamente la server action de la página (organizeCycleEvaluators
  // o createIndividualCycleRequest) — ya no redirige, así que el propio
  // asistente decide cuándo pasar al paso de confirmación.
  action: (prevState: WizardActionState, formData: FormData) => Promise<WizardActionState>;
  // Si el usuario ya tiene una solicitud abierta al cargar la página, se
  // muestra alreadyDoneContent en vez del asistente. Solo se lee UNA VEZ,
  // al montar (useState perezoso, no un efecto): al confirmar el paso 2,
  // Next.js vuelve a ejecutar el Server Component padre con datos frescos,
  // y ahora esa solicitud SÍ existe — si volviéramos a leer alreadyDone en
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

  // "confirmación" no es un paso que se guarde en el estado — se deriva de
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
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <Paragraphs text={introText} />
        </div>
        <div>
          <button
            type="button"
            onClick={() => setStep("seleccion")}
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
          >
            Siguiente
          </button>
        </div>
      </div>
    );
  }

  if (effectiveStep === "confirmacion") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <Paragraphs text={confirmacionText} />
        </div>
        <div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
          >
            Entendido, ir a mi panel
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-sm text-gray-700">
        <Paragraphs text={seleccionText} />
      </div>
      {state && "error" in state && (
        <p className="rounded bg-red-50 text-red-700 text-sm p-3">{state.error}</p>
      )}
      <fieldset disabled={pending} className="flex flex-col gap-4">
        {children}
      </fieldset>
    </form>
  );
}
