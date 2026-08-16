import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type FlatAnswerRow = {
  answer_text: string | null;
  answer_value: number | null;
  survey_questions: { prompt: string; position: number } | null;
};

type QuestionGroup = {
  prompt: string;
  position: number;
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
      "answer_text, answer_value, survey_questions(prompt, position), feedback_responses!inner(feedback_request_id, is_self)"
    )
    .eq("feedback_responses.feedback_request_id", requestId)
    .eq("feedback_responses.is_self", isSelf);

  const groupsByPrompt = new Map<string, QuestionGroup>();
  for (const row of (data as unknown as FlatAnswerRow[] | null) || []) {
    if (!row.survey_questions) continue;
    const display = row.answer_value != null ? `${row.answer_value} / 5` : row.answer_text;
    if (!display) continue;
    const { prompt, position } = row.survey_questions;
    if (!groupsByPrompt.has(prompt)) {
      groupsByPrompt.set(prompt, { prompt, position, answers: [] });
    }
    groupsByPrompt.get(prompt)!.answers.push(display);
  }
  return Array.from(groupsByPrompt.values()).sort((a, b) => a.position - b.position);
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

export default async function FeedbackRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: request } = await supabase
    .from("feedback_requests")
    .select("id, created_at, requester_member_id")
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

  const selfGroups = await loadQuestionGroups(supabase, id, true);
  const peerGroups = revealed ? await loadQuestionGroups(supabase, id, false) : [];

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

      {selfGroups.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Tu autoevaluación</h2>
          <QuestionGroupList groups={selfGroups} />
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
