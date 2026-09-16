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
  const [stepError, setStepError] = useState<string | null>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const total = questions.length;
  const isReview = step === total;

  // Antes esto solo comprobaba las preguntas abiertas (con `required`
  // nativo del navegador) — las de escala y "competencia" dejaban
  // avanzar sin responder, y el aviso de "falta esta respuesta" solo
  // llegaba al final, en el envío al servidor. Como ese envío es un
  // único formulario que recarga la página entera al fallar (redirect
  // del Server Action), todo lo ya rellenado se perdía y había que
  // volver a empezar. Ahora se valida cada pregunta obligatoria antes
  // de dejar avanzar, para que ese envío fallido casi nunca llegue a
  // pasar.
  function goNext() {
    const question = questions[step];
    const stepEl = stepRefs.current[step];

    if (question.required && stepEl) {
      if (question.question_type === "open") {
        const field = stepEl.querySelector<HTMLTextAreaElement>("textarea[required]");
        if (field && !field.reportValidity()) return;
      } else if (question.question_type === "scale") {
        const field = stepEl.querySelector<HTMLInputElement>(
          `input[type="hidden"][name="answer_${question.id}"]`
        );
        if (!field?.value) {
          setStepError("Desliza la barra para responder antes de continuar.");
          return;
        }
      } else if (question.question_type === "competency") {
        const selected = stepEl.querySelectorAll<HTMLInputElement>(
          `input[type="hidden"][name="competency_${question.id}"]`
        );
        if (selected.length === 0) {
          setStepError("Elige al menos una competencia antes de continuar.");
          return;
        }
        for (const sel of Array.from(selected)) {
          const valueField = stepEl.querySelector<HTMLInputElement>(
            `input[type="hidden"][name="competency_value_${question.id}_${sel.value}"]`
          );
          if (!valueField?.value) {
            setStepError("Desliza la barra de cada competencia elegida antes de continuar.");
            return;
          }
        }
      }
    }

    setStepError(null);
    setStep((s) => Math.min(s + 1, total));
  }

  function goBack() {
    setStepError(null);
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
          onChange={() => setStepError(null)}
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

      {stepError && <p className="text-sm text-red-700">{stepError}</p>}

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
