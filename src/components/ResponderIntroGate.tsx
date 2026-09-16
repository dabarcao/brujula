"use client";

import { useState, type ReactNode } from "react";
import { FormattedParagraphs } from "@/components/FormattedText";

// Pantalla previa al cuestionario, solo para quien evalúa a otra persona
// (nunca para la autoevaluación, texto pensado para ese caso concreto).
// Mismo patrón que Onboarding360Wizard: un paso de contexto antes de
// mostrar el formulario de verdad, controlado en el cliente para no
// perder el sitio al enviar.
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
      <div className="flex flex-col gap-3 text-sm text-gray-700">
        <FormattedParagraphs text={introText} />
      </div>
      <div>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
        >
          Comenzar feedback
        </button>
      </div>
    </div>
  );
}
