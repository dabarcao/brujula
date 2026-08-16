import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitFeedbackResponse } from "@/app/actions/feedback";

type Question = {
  id: string;
  prompt: string;
  required: boolean;
  question_type: string;
};

type ScaleLevel = {
  level: number;
  label: string;
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: invitation } = await supabase
    .from("feedback_invitations")
    .select("id, feedback_request_id, used_at, evaluator_category")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">No encontrada</h1>
          <p className="text-sm text-gray-600 mb-4">
            Esta invitación no existe o no te pertenece.
          </p>
          <Link href="/dashboard" className="underline text-sm">
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  if (invitation.used_at) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Ya has respondido</h1>
          <p className="text-sm text-gray-600 mb-4">Gracias por tu feedback.</p>
          <Link href="/dashboard" className="underline text-sm">
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  const isSelf = invitation.evaluator_category === "self";

  const { data: request } = await supabase
    .from("feedback_requests")
    .select("template_id, requester_member_id")
    .eq("id", invitation.feedback_request_id)
    .maybeSingle();

  const { data: evaluatee } = await supabase
    .from("members")
    .select("is_manager")
    .eq("id", request?.requester_member_id)
    .maybeSingle();

  const questionsQuery = supabase
    .from("survey_questions")
    .select("id, prompt, required, question_type, applies_to")
    .eq("template_id", request?.template_id)
    .order("position");

  const { data: allQuestions } = await questionsQuery;

  // Las preguntas "manager_only" (spec: distinción empleado/responsable, ver
  // 0006_departments_and_360_template.sql) solo aplican cuando la persona
  // EVALUADA es responsable de equipo, sin importar quién responde.
  const questions = (allQuestions as (Question & { applies_to: string })[] | null)?.filter(
    (q) => q.applies_to === "all" || evaluatee?.is_manager
  );

  const hasScaleQuestions = (questions as Question[] | null)?.some(
    (q) => q.question_type === "scale"
  );

  const { data: scaleLevels } = hasScaleQuestions
    ? await supabase.from("rating_scale_levels").select("level, label").order("level")
    : { data: null };

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-semibold mb-1">
        {isSelf ? "Tu autoevaluación" : "Dar feedback"}
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        {isSelf
          ? "Esta es tu propia valoración: no es anónima, es tu punto de vista."
          : "Tu respuesta es anónima: ni la persona que la solicitó ni nadie de tu empresa podrá saber que la escribiste tú."}
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      <form action={submitFeedbackResponse} className="flex flex-col gap-6">
        <input type="hidden" name="token" value={token} />

        {(questions as Question[] | null)?.map((question) => (
          <div key={question.id} className="flex flex-col gap-1">
            <input type="hidden" name="questionId" value={question.id} />
            <input type="hidden" name="questionType" value={question.question_type} />
            <label className="text-sm font-medium">
              {question.prompt}
              {!question.required && (
                <span className="text-gray-400 font-normal"> (opcional)</span>
              )}
            </label>

            {question.question_type === "scale" ? (
              <div className="flex gap-3 mt-1">
                {(scaleLevels as ScaleLevel[] | null)?.map((level) => (
                  <label
                    key={level.level}
                    title={level.label}
                    className="flex flex-col items-center gap-1 text-xs text-gray-600"
                  >
                    <input
                      type="radio"
                      name={`answer_${question.id}`}
                      value={level.level}
                      required={question.required}
                    />
                    {level.level}
                  </label>
                ))}
              </div>
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

        <button
          type="submit"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 self-start"
        >
          Enviar feedback
        </button>
      </form>
    </main>
  );
}
