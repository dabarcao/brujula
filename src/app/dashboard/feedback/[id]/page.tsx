import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelFeedbackRequest,
  closeFeedbackRequest,
  updateFeedbackRequestEvaluators,
} from "@/app/actions/feedback";
import EvaluatorPicker from "@/components/EvaluatorPicker";

type FlatAnswerRow = {
  answer_text: string | null;
  answer_value: number | null;
  survey_questions: { prompt: string; position: number; question_type: string } | null;
};

type QuestionGroup = {
  prompt: string;
  position: number;
  questionType: string;
  answers: string[];
};

async function loadQuestionGroups(
  supabase: SupabaseClient,
  requestId: string,
  isSelf: boolean
): Promise<QuestionGroup[]> {
  const { data } = await supabase
    .from("feedback_answers")
    .select(
      "answer_text, answer_value, survey_questions(prompt, position, question_type), feedback_responses!inner(feedback_request_id, is_self)"
    )
    .eq("feedback_responses.feedback_request_id", requestId)
    .eq("feedback_responses.is_self", isSelf);

  const groupsByPrompt = new Map<string, QuestionGroup>();
  for (const row of (data as unknown as FlatAnswerRow[] | null) || []) {
    if (!row.survey_questions) continue;
    const display = row.answer_value != null ? `${row.answer_value} / 5` : row.answer_text;
    if (!display) continue;
    const { prompt, position, question_type } = row.survey_questions;
    if (!groupsByPrompt.has(prompt)) {
      groupsByPrompt.set(prompt, { prompt, position, questionType: question_type, answers: [] });
    }
    groupsByPrompt.get(prompt)!.answers.push(display);
  }
  // Preguntas de escala primero, abiertas después (más fácil de leer de un
  // vistazo), y dentro de cada grupo, en el orden de la plantilla.
  return Array.from(groupsByPrompt.values()).sort((a, b) => {
    if (a.questionType !== b.questionType) {
      return a.questionType === "open" ? 1 : -1;
    }
    return a.position - b.position;
  });
}

function QuestionGroupList({ groups }: { groups: QuestionGroup[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.prompt}>
          <h3 className="text-sm font-medium mb-3">{group.prompt}</h3>
          <div className="flex flex-col gap-2">
            {group.answers.map((answer, index) => (
              <div key={index} className="border rounded p-3 text-sm text-gray-700">
                {answer}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function FeedbackRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("id, organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: request } = await supabase
    .from("feedback_requests")
    .select("id, created_at, requester_member_id, request_type, status")
    .eq("id", id)
    .maybeSingle();

  if (!request || !currentMember || request.requester_member_id !== currentMember.id) {
    redirect("/dashboard");
  }

  const { data: progressData } = await supabase
    .rpc("get_feedback_request_progress", { p_request_id: id })
    .maybeSingle();

  const progress = progressData as
    | { response_count: number; threshold: number; revealed: boolean }
    | null;

  const revealed = progress?.revealed ?? false;

  // La autoevaluación no se muestra aquí (texto/escala en crudo): queda
  // guardada para una futura comparativa con gráfica frente a la media
  // global o por grupos, no para listarla tal cual en esta vista.
  const peerGroups = revealed ? await loadQuestionGroups(supabase, id, false) : [];

  const isAdHocOpen = request.request_type === "ad_hoc" && request.status === "open";
  const canManage = isAdHocOpen && (progress?.response_count ?? 0) === 0;

  let colleagues: ColleagueRow[] | null = null;
  let currentInviteeIds: string[] = [];
  if (canManage) {
    const { data: colleaguesData } = await supabase
      .from("members")
      .select("id, email, full_name")
      .eq("status", "active")
      .neq("id", currentMember.id)
      .order("email");
    colleagues = colleaguesData;

    const { data: invitations } = await supabase
      .from("feedback_invitations")
      .select("invitee_member_id")
      .eq("feedback_request_id", id);
    currentInviteeIds = (invitations || [])
      .map((i) => i.invitee_member_id)
      .filter((v): v is string => Boolean(v));
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">
          Solicitud del {new Date(request.created_at).toLocaleDateString("es-ES")}
        </h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      {request.status === "closed" && (
        <p className="mb-6 rounded bg-gray-50 text-gray-600 text-sm p-3">
          Esta solicitud está {(progress?.response_count ?? 0) > 0 ? "completada" : "cancelada"}.
        </p>
      )}

      {isAdHocOpen && (
        <section className="mb-10 border rounded p-4">
          <p className="text-sm font-medium mb-3">Gestionar solicitud</p>

          {canManage ? (
            <>
              <p className="text-xs text-gray-500 mb-4">
                Todavía nadie ha respondido, así que puedes cambiar a quién
                invitaste o cancelarla.
              </p>
              <form
                action={updateFeedbackRequestEvaluators}
                className="flex flex-col gap-3 mb-4"
              >
                <input type="hidden" name="requestId" value={id} />
                <EvaluatorPicker
                  colleagues={colleagues || []}
                  checkboxName="inviteeIds"
                  defaultCheckedIds={currentInviteeIds}
                />
                <button
                  type="submit"
                  className="border rounded px-4 py-2 text-sm hover:bg-gray-50 self-start"
                >
                  Guardar cambios
                </button>
              </form>
              <form action={cancelFeedbackRequest} className="inline">
                <input type="hidden" name="requestId" value={id} />
                <button type="submit" className="text-sm underline text-red-700">
                  Cancelar solicitud
                </button>
              </form>
            </>
          ) : (
            <p className="text-xs text-gray-500 mb-4">
              Ya hay respuestas, así que no se puede cancelar ni cambiar a
              quién invitaste. Cuando ya no necesites seguir recibiendo
              respuestas, márcala como completada para poder pedir feedback
              de nuevo.
            </p>
          )}

          <form action={closeFeedbackRequest} className="mt-3">
            <input type="hidden" name="requestId" value={id} />
            <button type="submit" className="text-sm underline text-gray-700">
              Marcar como completada
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500 mb-4">Respuestas de compañeros</h2>
        {!revealed ? (
          <p className="text-sm text-gray-600">
            Esperando más respuestas ({progress?.response_count ?? 0} de{" "}
            {progress?.threshold ?? 3}). Nadie sabe quién ha respondido ya.
          </p>
        ) : (
          <QuestionGroupList groups={peerGroups} />
        )}
      </section>
    </main>
  );
}
