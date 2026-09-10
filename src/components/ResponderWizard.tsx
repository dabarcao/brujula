"use client";

import { useRef, useState } from "react";
import { submitFeedbackResponse } from "@/app/actions/feedback";
import CompetencyPicker from "@/components/CompetencyPicker";
import ScaleSlider from "@/components/ScaleSlider";

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

// Una pregunta a la vez en vez de todas seguidas (spec.md sección 17,
// "transversal") — cada pregunta sigue viviendo en el DOM todo el
// tiempo, solo se oculta con el atributo `hidden` (no se desmonta), así
// que sigue siendo un único formulario con un único envío al final,
// exactamente igual que antes: cero cambios en submit_feedback_response.
export default function ResponderWizard({
  token,
  questions,
  scaleLevels,
  competencies,
}: {
  token: string;
  questions: Question[];
  scaleLevels: ScaleLevel[];
  competencies: CompetencyOption[];
}) {
  const [step, setStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const total = questions.length;
  const isReview = step === total;

  function goNext() {
    // Solo se puede validar de verdad lo que el propio navegador sabe
    // comprobar (las abiertas, con `required` nativo) — las de escala y
    // "competencia" siguen dependiendo de la validación del servidor
    // (submit_feedback_response), igual que en el formulario de una sola
    // página de antes: no es una regresión, nunca hubo aviso previo ahí.
    const stepEl = stepRefs.current[step];
    if (stepEl) {
      const fields = stepEl.querySelectorAll<HTMLTextAreaElement>("textarea[required]");
      for (const field of Array.from(fields)) {
        if (!field.reportValidity()) return;
      }
    }
    setStep((s) => Math.min(s + 1, total));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const progressCurrent = isReview ? total : step + 1;
  const progressPct = Math.round((progressCurrent / (total + 1)) * 100);

  return (
    <form action={submitFeedbackResponse} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-black transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">
          {isReview ? "Revisión final" : `Pregunta ${step + 1} de ${total}`}
        </p>
      </div>

      {questions.map((question, i) => (
        <div
          key={question.id}
          ref={(el) => {
            stepRefs.current[i] = el;
          }}
          hidden={step !== i}
          className="flex flex-col gap-1"
        >
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="questionType" value={question.question_type} />
          <label className="text-sm font-medium">
            {question.prompt}
            {!question.required && (
              <span className="text-gray-400 font-normal"> (opcional)</span>
            )}
          </label>

          {question.question_type === "scale" ? (
            <ScaleSlider name={`answer_${question.id}`} levels={scaleLevels} />
          ) : question.question_type === "competency" ? (
            <CompetencyPicker
              questionId={question.id}
              competencies={competencies}
              maxSelections={question.max_selections || 1}
              scaleLevels={scaleLevels}
            />
          ) : (
            <textarea
              name={`answer_${question.id}`}
              required={question.required}
              rows={3}
              className="border rounded px-3 py-2 text-sm"
            />
          )}
        </div>
      ))}

      {isReview && (
        <p className="text-sm text-gray-600 border rounded p-4">
          Has repasado las {total} preguntas. Cuando quieras, envía tu feedback — si
          falta alguna respuesta obligatoria, te lo diremos antes de guardar nada.
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="text-sm underline text-gray-600 disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        {isReview ? (
          <button
            type="submit"
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
          >
            Enviar feedback
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
          >
            Siguiente
          </button>
        )}
      </div>
    </form>
  );
}
