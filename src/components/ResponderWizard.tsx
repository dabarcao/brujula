"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { submitFeedbackResponse } from "@/app/actions/feedback";
import CompetencyPicker from "@/components/CompetencyPicker";
import ScaleSlider from "@/components/ScaleSlider";
import ProgressBar from "@/components/ui/ProgressBar";
import BookmarkChip from "@/components/ui/BookmarkChip";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ButtonSecondary from "@/components/ui/ButtonSecondary";
import Card from "@/components/ui/Card";

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

// CSS class applied imperatively (see the `step`-driven effect below) to
// whichever question/review panel is currently visible, restarted via a
// remove -> reflow -> re-add cycle rather than a React `key` change --
// this file's own established pattern is that no question panel is ever
// unmounted (see the comment further down), so re-keying it to retrigger
// the animation would wipe whatever the user already typed. The exact
// literal string has to appear in this file's source for Tailwind's
// content scanner to generate the class; `motion-safe:` makes the
// animation itself disappear entirely under `prefers-reduced-motion`
// (Tailwind's own gate), leaving an instant, un-staggered swap.
const STEP_TRANSITION_CLASS = "motion-safe:animate-[brujula-wizard-step-in_200ms_ease-out_both]";

type DraftValues = Record<string, string[]>;

type StoredDraft = {
  step: number;
  values: DraftValues;
};

function draftStorageKey(token: string) {
  return `brujula:responder-draft:${token}`;
}

// spec-4-4 post-review patch (fix #1, 3-lens review, high-confidence
// data-loss bug): the draft used to be wiped synchronously inside
// `handleSubmit`'s `onSubmit`, before the Server Action
// (`submitFeedbackResponse`) had actually run or returned anything --
// native form submission with a Server Action gives no synchronous
// success/failure signal before navigation, so that clear fired
// unconditionally on every submit attempt. A submission the server
// rejects (e.g. a required scale/competency question left blank -- those
// have no client-side check today, only `<textarea required>` fields do,
// see `goNext`) redirects back to `/responder/${token}?error=...` with
// `ctx.used` still `false`; the wizard used to remount with the draft
// already gone, losing every answer including the valid ones.
//
// Fixed by moving the clear out of this component entirely: it now only
// happens from <ClearResponderDraft>, rendered exclusively by
// src/app/responder/[token]/page.tsx's `ctx.used` branch -- reached only
// after `submitFeedbackResponse` has redirected back here with a
// server-confirmed successful submission. A failed submission never
// touches `ctx.used`, so this never mounts and the draft survives.
export function ClearResponderDraft({ token }: { token: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem(draftStorageKey(token));
    } catch {
      // ignore -- best-effort cleanup only, never load-bearing.
    }
  }, [token]);
  return null;
}

/** Reads every non-empty value for `name` out of a restored draft
 * (there can be more than one for a multi-value field like
 * `competency_<questionId>`). */
function draftValuesFor(values: DraftValues, name: string): string[] {
  return values[name] ?? [];
}

// spec-4-4 post-review patch (fix #3): this file used to also read
// `prefers-reduced-motion` in JS (via its own useSyncExternalStore hook)
// solely to gate the final-submit checkmark's *existence*, unlike every
// other reduced-motion case in this file (the question-transition class
// above), which is purely CSS-driven via Tailwind's `motion-safe:` prefix
// -- content stays mounted, only the animation utility is withheld. That
// JS-level hook has been removed; the checkmark below now follows the
// same `motion-safe:`-only pattern (see its own comment), so reduced-
// motion users still see a static confirmation glyph instead of none at
// all.

type DraftSnapshot = {
  ready: boolean;
  hasDraft: boolean;
  step: number;
  values: DraftValues;
};

const READY_SERVER_SNAPSHOT: DraftSnapshot = { ready: false, hasDraft: false, step: 0, values: {} };

// Computed once per token and cached (useSyncExternalStore requires a
// stable reference across calls, or it would treat every render as a
// change) -- localStorage is synchronous, so there's no real "loading"
// state, just a value that isn't safe to read during SSR/the hydration
// render (see getReducedMotionServerSnapshot's own comment above for why).
const draftSnapshotCache = new Map<string, DraftSnapshot>();

function computeDraftSnapshot(token: string, total: number): DraftSnapshot {
  const cached = draftSnapshotCache.get(token);
  if (cached) return cached;

  let snapshot: DraftSnapshot = { ready: true, hasDraft: false, step: 0, values: {} };
  try {
    const raw = localStorage.getItem(draftStorageKey(token));
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDraft;
      if (parsed && typeof parsed.step === "number" && parsed.values) {
        snapshot = {
          ready: true,
          hasDraft: true,
          step: Math.min(Math.max(parsed.step, 0), total),
          values: parsed.values,
        };
      }
    }
  } catch {
    // Corrupt or unavailable -- start fresh (snapshot already defaults to
    // hasDraft: false).
  }
  draftSnapshotCache.set(token, snapshot);
  return snapshot;
}

function subscribeNever(): () => void {
  return () => {};
}

/** localStorage draft, read once per token (spec-4-4, frozen Intent:
 * "pause/resume must be client-side-only"). No subscription -- the
 * on-disk draft never changes from outside this component during its own
 * lifetime, so `subscribeNever` satisfies useSyncExternalStore's contract
 * without a fake event source (same shape as AcceptAcknowledgment.tsx's
 * own no-op subscribe). */
function useDraftSnapshot(token: string, total: number): DraftSnapshot {
  return useSyncExternalStore(
    subscribeNever,
    () => computeDraftSnapshot(token, total),
    () => READY_SERVER_SNAPSHOT
  );
}

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
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const total = questions.length;
  const isReview = step === total;

  // Draft persistence (spec-4-4, frozen Intent: "pause/resume must be
  // client-side-only") -- localStorage only, keyed by this request's own
  // token, never a Server Action/RPC/backend call. `draft.ready` is
  // `false` for SSR and the first (hydration) client render, then flips
  // true via useSyncExternalStore's own re-sync (see useDraftSnapshot) --
  // never a manually-managed effect + setState.
  const draft = useDraftSnapshot(token, total);

  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [ready, setReady] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Seed local, from-here-on-mutable state from the draft exactly once,
  // the moment it becomes available -- "adjusting state when a value
  // changes" done directly during render (React's own documented
  // alternative to an effect for this case: https://react.dev/learn/
  // you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
  // never inside a `useEffect` body, so there's no cascading-render lint
  // concern. Bails out (via `ready`) after the first time `draft.ready`
  // flips true, so it never re-fires on later, user-driven step changes.
  if (draft.ready && !ready) {
    setReady(true);
    if (draft.hasDraft) {
      setDraftValues(draft.values);
      setStep(draft.step);
      setHasDraft(true);
    }
  }

  // Once the restored open-text answers are known, apply them directly to
  // the (uncontrolled) textarea DOM nodes -- these live inside
  // ResponderWizard itself (not a separate controlled child component),
  // so a plain `.value` write is enough and never gets clobbered by React
  // afterwards (no `value=`/`onChange` prop is ever set on them).
  useEffect(() => {
    if (!ready) return;
    const form = formRef.current;
    if (!form) return;
    for (const q of questions) {
      if (q.question_type !== "open") continue;
      const values = draftValuesFor(draftValues, `answer_${q.id}`);
      if (!values[0]) continue;
      const el = form.querySelector<HTMLTextAreaElement>(`textarea[name="answer_${q.id}"]`);
      if (el) el.value = values[0];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Snapshot every current form value (open textareas, scale hidden
  // inputs, competency selections) into localStorage. Reading via
  // `FormData` mirrors exactly what submitFeedbackResponse itself parses
  // (src/app/actions/feedback.ts) -- the same field names, so restoring
  // is just handing those same values back to the same fields. Skips
  // writing (and clears any previous draft) once the wizard is back at a
  // genuinely untouched step-0 state, so reloading a fresh, never-touched
  // wizard doesn't fabricate a "saved draft" of nothing.
  function saveDraft(currentStep: number) {
    try {
      const form = formRef.current;
      if (!form) return;
      const fd = new FormData(form);
      const values: DraftValues = {};
      for (const [key, value] of fd.entries()) {
        if (key === "token" || key === "questionId" || key === "questionType") continue;
        if (typeof value !== "string" || value === "") continue;
        (values[key] ??= []).push(value);
      }
      const meaningful = currentStep > 0 || Object.keys(values).length > 0;
      if (!meaningful) {
        localStorage.removeItem(draftStorageKey(token));
        return;
      }
      localStorage.setItem(
        draftStorageKey(token),
        JSON.stringify({ step: currentStep, values } satisfies StoredDraft)
      );
    } catch {
      // localStorage unavailable -- draft persistence is a convenience
      // only, never load-bearing.
    }
  }

  // Live-typed answers are also captured as they're typed (debounced),
  // not only at step navigation -- closing the tab without ever tapping
  // "Siguiente" again must not lose the question already in progress.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleFormChange() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(step), 250);
  }

  // CSS-only question transition (spec-4-4 Code Map: "new keyframes for
  // the question transition... following the established motion-safe:/
  // fill-mode conventions"). Applied imperatively via a remove -> reflow
  // -> re-add cycle so the same DOM node can replay the animation on every
  // step change without ever being unmounted (see the file-level comment
  // on why nothing here unmounts). Skipped on the very first, restore-
  // driven jump to a saved step so reopening a paused wizard doesn't
  // itself look like an animated "advance".
  const firstReadyStep = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstReadyStep.current) {
      firstReadyStep.current = false;
      return;
    }
    const el = isReview ? reviewRef.current : stepRefs.current[step];
    if (!el) return;
    el.classList.remove(STEP_TRANSITION_CLASS);
    void el.offsetWidth; // force reflow so the animation can restart
    el.classList.add(STEP_TRANSITION_CLASS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ready]);

  // Antes esto solo comprobaba las preguntas abiertas (con `required`
  // nativo del navegador) — las de escala y "competencia" dejaban avanzar
  // sin responder, y el aviso de "falta esta respuesta" solo llegaba al
  // final, en el envío al servidor. Como ese envío es un único formulario
  // que recarga la página entera al fallar (redirect del Server Action),
  // todo lo ya rellenado se perdía y había que volver a empezar. Ahora se
  // valida cada pregunta obligatoria antes de dejar avanzar, para que ese
  // envío fallido casi nunca llegue a pasar (spec-7.7, ports upstream
  // `69f6495`).
  function goNext() {
    const currentQuestion = questions[step];
    const stepEl = stepRefs.current[step];

    if (currentQuestion.required && stepEl) {
      if (currentQuestion.question_type === "open") {
        const field = stepEl.querySelector<HTMLTextAreaElement>("textarea[required]");
        if (field && !field.reportValidity()) return;
      } else if (currentQuestion.question_type === "scale") {
        const field = stepEl.querySelector<HTMLInputElement>(
          `input[type="hidden"][name="answer_${currentQuestion.id}"]`
        );
        if (!field?.value) {
          setStepError("Desliza la barra para responder antes de continuar.");
          return;
        }
      } else if (currentQuestion.question_type === "competency") {
        const selected = stepEl.querySelectorAll<HTMLInputElement>(
          `input[type="hidden"][name="competency_${currentQuestion.id}"]`
        );
        if (selected.length === 0) {
          setStepError("Elige al menos una competencia antes de continuar.");
          return;
        }
        for (const sel of Array.from(selected)) {
          const valueField = stepEl.querySelector<HTMLInputElement>(
            `input[type="hidden"][name="competency_value_${currentQuestion.id}_${sel.value}"]`
          );
          if (!valueField?.value) {
            setStepError("Desliza la barra de cada competencia elegida antes de continuar.");
            return;
          }
        }
      }
    }

    setStepError(null);
    const next = Math.min(step + 1, total);
    setStep(next);
    saveDraft(next);
  }

  function goBack() {
    setStepError(null);
    const prev = Math.max(step - 1, 0);
    setStep(prev);
    saveDraft(prev);
  }

  function handleSubmit() {
    setSubmitting(true);
    // No preventDefault: submitFeedbackResponse's own redirect is
    // completely unchanged, this only adds a decorative flash while that
    // real submission is in flight.
    //
    // spec-4-4 post-review patch (fix #1): the draft is intentionally left
    // untouched here. Native form submission with a Server Action gives no
    // synchronous success/failure signal at this point -- clearing the
    // draft here would happen on every submit attempt, including ones the
    // server goes on to reject, wiping every answer with nothing left to
    // restore. The draft is only ever cleared by <ClearResponderDraft>,
    // rendered from src/app/responder/[token]/page.tsx's `ctx.used`
    // branch, which is reached exclusively after a confirmed successful
    // submission.
  }

  const progressCurrent = isReview ? total : step + 1;

  return (
    <form
      ref={formRef}
      action={submitFeedbackResponse}
      onSubmit={handleSubmit}
      onChange={handleFormChange}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <ProgressBar value={progressCurrent} max={total + 1} />
        {isReview && <p className="text-caption text-ink-soft">Revisión final</p>}
      </div>

      {hasDraft && (
        <BookmarkChip className="self-start px-4 py-2">
          Guardado — continúa cuando quieras
        </BookmarkChip>
      )}

      {questions.map((question, i) => {
        const isCompetency = question.question_type === "competency";
        const scaleDraft = draftValuesFor(draftValues, `answer_${question.id}`)[0];
        const competencyCodes = draftValuesFor(draftValues, `competency_${question.id}`);
        const competencyEntries = competencyCodes.map((code) => ({
          code,
          value: (() => {
            const raw = draftValuesFor(draftValues, `competency_value_${question.id}_${code}`)[0];
            return raw ? Number(raw) : null;
          })(),
          text: draftValuesFor(draftValues, `competency_text_${question.id}_${code}`)[0] ?? "",
        }));

        return (
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
            <label className="text-sm font-medium text-ink">
              {question.prompt}
              {!question.required && (
                <span className="text-ink-soft font-normal"> (opcional)</span>
              )}
            </label>

            {question.question_type === "scale" ? (
              <ScaleSlider
                key={`${question.id}-${ready}`}
                name={`answer_${question.id}`}
                levels={scaleLevels}
                defaultValue={scaleDraft ? Number(scaleDraft) : undefined}
              />
            ) : isCompetency ? (
              <CompetencyPicker
                key={`${question.id}-${ready}`}
                questionId={question.id}
                competencies={competencies}
                maxSelections={question.max_selections || 1}
                scaleLevels={scaleLevels}
                defaultEntries={competencyEntries}
              />
            ) : (
              <textarea
                name={`answer_${question.id}`}
                required={question.required}
                rows={4}
                className="border border-line rounded-brujula-sm px-3 py-2 text-sm bg-paper-deep text-ink"
              />
            )}
          </div>
        );
      })}

      {isReview && (
        <div ref={reviewRef}>
          <Card>
            <p className="text-sm text-ink-soft">
              Has repasado las {total} preguntas. Cuando quieras, envía tu feedback — si
              falta alguna respuesta obligatoria, te lo diremos antes de guardar nada.
            </p>
          </Card>
        </div>
      )}

      {stepError && <p className="text-sm text-red-700">{stepError}</p>}

      <div className="flex items-center justify-between">
        <ButtonSecondary onClick={goBack} disabled={step === 0}>
          Anterior
        </ButtonSecondary>
        {isReview ? (
          <ButtonPrimary type="submit" className="relative">
            Enviar feedback
            {submitting && (
              // spec-4-4 post-review patch (fix #3): the element itself
              // used to be gated on `!prefersReducedMotion` too, unlike
              // the question-transition animation above (which only
              // withholds `motion-safe:animate-*`, never the content) --
              // reduced-motion users got no confirmation glyph at all
              // instead of an instant/non-animated one. Now only the
              // animation utility is `motion-safe:`-gated; the static
              // checkmark itself is always present while submitting.
              <span
                aria-hidden="true"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-wash text-indigo-deep motion-safe:animate-[brujula-check-pop_300ms_ease-out_both]"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="4 12 9 17 20 6" />
                </svg>
              </span>
            )}
          </ButtonPrimary>
        ) : (
          <ButtonPrimary onClick={goNext}>Siguiente</ButtonPrimary>
        )}
      </div>
    </form>
  );
}
