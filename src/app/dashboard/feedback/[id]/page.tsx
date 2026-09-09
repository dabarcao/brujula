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
import CompetencyComparisonChart from "@/components/CompetencyComparisonChart";

type FlatAnswerRow = {
  answer_text: string | null;
  answer_value: number | null;
  survey_questions: { prompt: string; position: number; question_type: string } | null;
};

type QuestionGroup = {
  prompt: string;
  position: number;
  answers: string[];
};

// Solo preguntas abiertas sin competencia asociada — las de escala y las
// de tipo "competency" van al resumen agregado (CompetencySummaryTable),
// no se listan respuesta por respuesta.
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
    if (row.survey_questions.question_type !== "open") continue;
    if (!row.answer_text) continue;
    const { prompt, position } = row.survey_questions;
    if (!groupsByPrompt.has(prompt)) {
      groupsByPrompt.set(prompt, { prompt, position, answers: [] });
    }
    groupsByPrompt.get(prompt)!.answers.push(row.answer_text);
  }
  return Array.from(groupsByPrompt.values()).sort((a, b) => a.position - b.position);
}

function QuestionGroupList({ groups }: { groups: QuestionGroup[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.prompt}>
          <h3 className="text-sm font-semibold mb-3">{group.prompt}</h3>
          <div className="flex flex-col gap-3">
            {group.answers.map((answer, index) => (
              <p key={index} className="text-sm text-gray-700">
                {answer}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type CompetencySummaryRow = {
  competency_code: string;
  competency_name: string | null;
  avg_value: number;
  response_count: number;
  percentile_empresa: number | null;
  percentile_global: number | null;
};

function CompetencySummaryTable({ rows }: { rows: CompetencySummaryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-8">
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-4 py-2 font-medium">Competencia</th>
            <th className="px-4 py-2 font-medium">Nota media</th>
            <th className="px-4 py-2 font-medium">Percentil empresa</th>
            <th className="px-4 py-2 font-medium">Percentil global</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.competency_code}>
              <td className="px-4 py-2">{row.competency_name || row.competency_code}</td>
              <td className="px-4 py-2">{row.avg_value} / 5</td>
              <td className="px-4 py-2 text-gray-500">
                {row.percentile_empresa != null ? `${row.percentile_empresa}%` : "—"}
              </td>
              <td className="px-4 py-2 text-gray-500">
                {row.percentile_global != null ? `${row.percentile_global}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-2">
        El percentil global todavía no es fiable — hay muy pocos datos en la
        plataforma para compararse de verdad. Se muestran igualmente para
        tener el mecanismo listo cuando haya más volumen.
      </p>
    </div>
  );
}

type CompetencyComparisonRow = {
  competency_code: string;
  competency_name: string;
  principle_code: string | null;
  principle_name: string | null;
  role_code: string | null;
  role_name: string | null;
  self_value: number | null;
  peer_avg_value: number | null;
  peer_response_count: number;
};

type CompetencyByCategoryRow = {
  competency_code: string;
  evaluator_category: string;
  avg_value: number;
  response_count: number;
};

// Comparativa autoevaluación vs. media de los demás — solo tiene sentido
// en un ciclo 360 (es el único flujo con autoevaluación). El "por
// competencias" libre (ad_hoc) sigue usando CompetencySummaryTable. Cada
// grupo de evaluador (jefe/equipo/empresa/otro) solo aparece aquí si ya
// tiene su mínimo cumplido — get_request_competency_by_category ya lo
// filtra, aquí no hay que volver a comprobarlo.
//
// Plenitud no vive dentro de ningún rol VACC (docs/modelo_roles_vacc.md)
// — se dibuja en su propio mini-radar, aparte del de los 4 roles, en vez
// de mezclada en el mismo círculo.
function CompetencyComparison({
  rows,
  byCategoryRows,
}: {
  rows: CompetencyComparisonRow[];
  byCategoryRows: CompetencyByCategoryRow[];
}) {
  if (rows.length === 0) return null;
  const axes = rows.map((row) => ({
    code: row.competency_code,
    name: row.competency_name,
    groupCode: row.role_code || "plenitud",
    peerAvgValue: row.peer_avg_value,
    selfValue: row.self_value,
  }));

  const byCategory = new Map<string, Record<string, number>>();
  for (const row of byCategoryRows) {
    if (!byCategory.has(row.evaluator_category)) {
      byCategory.set(row.evaluator_category, {});
    }
    byCategory.get(row.evaluator_category)![row.competency_code] = row.avg_value;
  }
  const categorySeries = Array.from(byCategory.entries()).map(([category, valuesByCode]) => ({
    category,
    valuesByCode,
  }));

  return (
    <div className="mb-8">
      <CompetencyComparisonChart axes={axes} categorySeries={categorySeries} />
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
    .select("id, organization_id, organizations(kind)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: request } = await supabase
    .from("feedback_requests")
    .select("id, created_at, requester_member_id, request_type, status, closes_at")
    .eq("id", id)
    .maybeSingle();

  if (!request || !currentMember || request.requester_member_id !== currentMember.id) {
    redirect("/dashboard");
  }

  const { data: progressData } = await supabase
    .rpc("get_feedback_request_progress", { p_request_id: id })
    .maybeSingle();

  const progress = progressData as
    | { response_count: number; threshold: number; revealed: boolean; self_responded: boolean }
    | null;

  const revealed = progress?.revealed ?? false;

  // progress.response_count ya es solo de compañeros (nunca cuenta la
  // propia autoevaluación, sección 6) — para comprobar "¿ya respondió
  // todo el mundo, incluido yo?" hace falta sumarle la autoevaluación
  // aparte.
  const totalResponseCount = (progress?.response_count ?? 0) + (progress?.self_responded ? 1 : 0);

  // "Definitivo" cuando ya no puede cambiar más: la solicitud se cerró a
  // mano, respondieron todos los invitados, o (en un ciclo 360) ya pasó la
  // fecha de cierre. Mientras tanto, si ya se reveló, es "preliminar" —
  // puede variar según sigan llegando respuestas.
  const { count: totalInvitees } = await supabase
    .from("feedback_invitations")
    .select("id", { count: "exact", head: true })
    .eq("feedback_request_id", id);

  const cycleClosesAt: string | null = request.closes_at ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const isFinal =
    request.status === "closed" ||
    (totalInvitees != null && totalResponseCount >= totalInvitees) ||
    (cycleClosesAt != null && cycleClosesAt < today);

  // La autoevaluación no se muestra aquí (texto/escala en crudo): queda
  // guardada para una futura comparativa con gráfica frente a la media
  // global o por grupos, no para listarla tal cual en esta vista.
  const peerGroups = revealed ? await loadQuestionGroups(supabase, id, false) : [];

  const isCycle = request.request_type === "cycle";

  const { data: competencySummaryData } = revealed && !isCycle
    ? await supabase.rpc("get_request_competency_summary", { p_request_id: id })
    : { data: null };
  const competencySummary = (competencySummaryData as CompetencySummaryRow[] | null) || [];

  const { data: competencyComparisonData } = revealed && isCycle
    ? await supabase.rpc("get_request_competency_comparison", { p_request_id: id })
    : { data: null };
  const competencyComparison =
    (competencyComparisonData as CompetencyComparisonRow[] | null) || [];

  const { data: competencyByCategoryData } = revealed && isCycle
    ? await supabase.rpc("get_request_competency_by_category", { p_request_id: id })
    : { data: null };
  const competencyByCategory =
    (competencyByCategoryData as CompetencyByCategoryRow[] | null) || [];

  const isAdHocOpen = request.request_type === "ad_hoc" && request.status === "open";
  const canManage = isAdHocOpen && totalResponseCount === 0;

  // Solo para decidir si se muestra el enlace a "Gestionar evaluadores" —
  // esa página (feedback/[id]/gestionar) hace su propia comprobación
  // completa de si todavía se puede modificar algo.
  const canLinkToManageCycle = isCycle && request.status === "open" && !isFinal;

  let colleagues: ColleagueRow[] | null = null;
  let currentInviteeIds: string[] = [];
  let minInvitees = 5;
  if (canManage) {
    const { data: settings } = await supabase
      .from("platform_settings")
      .select("min_invitees_per_request")
      .eq("organization_id", currentMember.organization_id)
      .maybeSingle();
    minInvitees = settings?.min_invitees_per_request ?? 5;

    const { data: colleaguesData } = await supabase
      .from("members")
      .select("id, email, full_name")
      .eq("status", "active")
      .eq("is_supervisor", false)
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
                  minSelected={minInvitees}
                />
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
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-medium text-gray-500">Respuestas de compañeros</h2>
          {isCycle && canLinkToManageCycle && (
            <Link
              href={`/dashboard/feedback/${id}/gestionar`}
              className="text-xs underline text-gray-600"
            >
              Gestionar evaluadores
            </Link>
          )}
          {revealed && (
            <span
              className={
                "text-xs rounded-full px-2 py-0.5 " +
                (isFinal ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")
              }
            >
              {isFinal ? "definitivo" : "preliminar"}
            </span>
          )}
        </div>
        {!revealed ? (
          <p className="text-sm text-gray-600">
            Han respondido {progress?.response_count ?? 0} de {progress?.threshold ?? 3}{" "}
            necesarias para poder ver algo. Nadie sabe quién ha respondido ya.
            {isCycle && !progress?.self_responded && (
              <>
                {" "}
                Además, hasta que no hagas tu propia autoevaluación tampoco podrás ver
                cómo te ven los demás.
              </>
            )}
            {isCycle &&
              progress?.self_responded &&
              (progress?.response_count ?? 0) >= (progress?.threshold ?? 3) && (
                <>
                  {" "}
                  Ya se ha superado el mínimo, pero en un 360 no se muestra nada
                  hasta tener al menos el 80% de las respuestas — para no ver el
                  informe cambiando todo el rato con muy pocos datos.
                </>
              )}
          </p>
        ) : (
          <>
            {!isFinal && (
              <p className="text-xs text-gray-500 mb-4">
                Todavía puede cambiar: faltan respuestas por llegar
                {cycleClosesAt ? ` o que se cierre el ${cycleClosesAt}` : ""}.
              </p>
            )}
            {isCycle ? (
              <CompetencyComparison rows={competencyComparison} byCategoryRows={competencyByCategory} />
            ) : (
              <CompetencySummaryTable rows={competencySummary} />
            )}
            <QuestionGroupList groups={peerGroups} />
          </>
        )}
      </section>
    </main>
  );
}
