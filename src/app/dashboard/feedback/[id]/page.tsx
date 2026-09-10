import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cancelFeedbackRequest,
  closeFeedbackRequest,
  updateFeedbackRequestEvaluators,
} from "@/app/actions/feedback";
import { finalizeCycleRequest } from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import CompetencyComparisonChart from "@/components/CompetencyComparisonChart";
import { GROUP_COLORS, GROUP_LABELS } from "@/components/CompetencyRadar";
import { SABOTEADOR_LABELS } from "@/lib/aiInterpretation";

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

type CompetencyNarrativeRow = {
  question_position: number;
  question_prompt: string;
  competency_code: string;
  competency_name: string | null;
  role_code: string | null;
  mention_count: number;
  avg_value: number;
  comments: string[] | null;
};

// Las 3 preguntas de la plantilla ad_hoc_competencias (migración 0026) son
// fijas, siempre en este orden — de ahí un titular narrativo por posición
// en vez de mostrar el texto literal de la pregunta. Si algún día hay más
// preguntas de tipo "competency" con otro propósito, se cae al prompt tal
// cual en vez de romper.
const NARRATIVE_HEADLINES: Record<number, string> = {
  1: "Tus compañeros dicen que destacas en:",
  2: "Un desafío para ti sería:",
  3: "Algo que a los demás les gustaría ver más de ti es:",
};

function CompetencyNarrativeReport({ rows }: { rows: CompetencyNarrativeRow[] }) {
  if (rows.length === 0) return null;

  const byQuestion = new Map<number, { prompt: string; rows: CompetencyNarrativeRow[] }>();
  for (const row of rows) {
    if (!byQuestion.has(row.question_position)) {
      byQuestion.set(row.question_position, { prompt: row.question_prompt, rows: [] });
    }
    byQuestion.get(row.question_position)!.rows.push(row);
  }
  const questions = Array.from(byQuestion.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="mb-8 flex flex-col gap-8">
      {questions.map(([position, { prompt, rows: qRows }]) => (
        <div key={position}>
          <p className="text-base font-semibold mb-3">
            {NARRATIVE_HEADLINES[position] || prompt}
          </p>
          <div className="flex flex-col divide-y">
            {qRows.map((row) => {
              const groupCode = row.role_code || "plenitud";
              const color = GROUP_COLORS[groupCode] || "#6b7280";
              const dimension = GROUP_LABELS[groupCode] || groupCode;
              return (
                <div key={row.competency_code} className="pt-4 first:pt-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {row.competency_name || row.competency_code}
                      <span className="text-gray-400 font-normal">({dimension})</span>
                    </p>
                    <span className="text-xs text-gray-400 shrink-0">
                      {row.mention_count === 1 ? "1 mención" : `${row.mention_count} menciones`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Nota media {row.avg_value} / 5</p>
                  {row.comments && row.comments.length > 0 && (
                    <ul className="flex flex-col gap-1.5 mt-2.5">
                      {row.comments.map((comment, i) => (
                        <li key={i} className="text-sm text-gray-700 pl-3" style={{ borderLeft: `2px solid ${color}` }}>
                          {comment}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
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

type SaboteadorRow = {
  saboteador_code: string;
  avg_value: number;
  is_high: boolean;
};

// Datos crudos de los 5 saboteadores (no solo el párrafo de la IA) —
// mismo lenguaje visual que la tabla de CompetencyComparisonChart, pero
// sin columna de "media de compañeros": estas preguntas son solo de
// autoevaluación por diseño (migración 0061), nunca se le piden al
// grupo evaluador, así que aquí no hay "donde me ven", solo "donde me
// veo".
function SaboteadoresReport({ rows }: { rows: SaboteadorRow[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.avg_value - a.avg_value);
  return (
    <div className="mb-8">
      <p className="text-sm font-medium text-gray-500 mb-1">Tus saboteadores</p>
      <p className="text-xs text-gray-400 mb-4">
        Solo autoevaluación — nadie más puntúa esto, así que no hay una media de
        compañeros con la que compararlo.
      </p>
      <div className="flex flex-col gap-3">
        {sorted.map((row) => {
          const label = SABOTEADOR_LABELS[row.saboteador_code] || row.saboteador_code;
          const color = row.is_high ? "#b45309" : "#6b7280";
          return (
            <div key={row.saboteador_code}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium" style={{ color: row.is_high ? color : undefined }}>
                  {label}
                </span>
                <span className="text-gray-500">{row.avg_value.toFixed(1)} / 5</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(row.avg_value / 5) * 100}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
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
    .select(
      "id, created_at, requester_member_id, request_type, status, closes_at, name, feedback_cycles(name), ai_interpretation"
    )
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

  const { count: totalInvitees } = await supabase
    .from("feedback_invitations")
    .select("id", { count: "exact", head: true })
    .eq("feedback_request_id", id);

  const cycleClosesAt: string | null = request.closes_at ?? null;

  const isCycle = request.request_type === "cycle";

  // "Definitivo" cuando ya no puede cambiar más. Para un 360: solo el
  // propio solicitante finalizándolo a mano (status = 'closed') —
  // "el usuario es el dueño de su proceso, no las condiciones" (sección
  // 4.1): ni la fecha ni el 100% de respuestas cierran nada solos. Para
  // el flujo ágil, que no se tocó, sigue el criterio anterior.
  const isFinal = isCycle
    ? request.status === "closed"
    : request.status === "closed" ||
      (totalInvitees != null && totalResponseCount >= totalInvitees);

  // Comentarios de texto (y la interpretación de IA, más abajo) de un 360
  // esperan a que el solicitante lo finalice — nunca solo con el 80%. En
  // el flujo ágil, que no se tocó, siguen mostrándose en cuanto se revela.
  const showRestrictedContent = revealed && (!isCycle || isFinal);

  // La autoevaluación no se muestra aquí (texto/escala en crudo): queda
  // guardada para una futura comparativa con gráfica frente a la media
  // global o por grupos, no para listarla tal cual en esta vista.
  const peerGroups = showRestrictedContent ? await loadQuestionGroups(supabase, id, false) : [];

  const cycleName = (request.feedback_cycles as unknown as { name: string } | null)?.name;
  // "Ciclo 360 " / "Feedback ágil " es siempre el prefijo — la persona
  // solo escribe lo que sigue (ver el label de cada formulario de
  // creación, que ya deja esto claro para no duplicar palabras).
  const fallbackDate = `del ${new Date(request.created_at).toLocaleDateString("es-ES")}`;
  const requestLabel = isCycle
    ? `Ciclo 360 ${cycleName || request.name || fallbackDate}`
    : `Feedback ágil ${request.name || fallbackDate}`;

  const { data: competencyNarrativeData } = revealed && !isCycle
    ? await supabase.rpc("get_request_competency_narrative", { p_request_id: id })
    : { data: null };
  const competencyNarrative = (competencyNarrativeData as CompetencyNarrativeRow[] | null) || [];

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

  const { data: saboteadoresData } = isCycle && showRestrictedContent
    ? await supabase.rpc("get_request_saboteadores", { p_request_id: id })
    : { data: null };
  const saboteadores = (saboteadoresData as SaboteadorRow[] | null) || [];

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
        <h1 className="text-2xl font-semibold">{requestLabel}</h1>
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
            {!isFinal && !isCycle && (
              <p className="text-xs text-gray-500 mb-4">
                Todavía puede cambiar: faltan respuestas por llegar
                {cycleClosesAt ? ` o que se cierre el ${cycleClosesAt}` : ""}.
              </p>
            )}
            {isCycle && !isFinal && (
              <div className="mb-6 border rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-3">
                  Es preliminar: de momento solo ves los datos agregados.
                  {cycleClosesAt ? ` Fecha límite sugerida: ${cycleClosesAt}.` : ""} Los
                  comentarios de texto y la interpretación de tu perfil se
                  desbloquean cuando tú decidas finalizarlo — no antes, y no
                  automáticamente.
                </p>
                <form action={finalizeCycleRequest}>
                  <input type="hidden" name="requestId" value={id} />
                  <button
                    type="submit"
                    className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
                  >
                    Finalizar informe
                  </button>
                </form>
              </div>
            )}
            {isCycle && isFinal && cycleClosesAt && (
              <p className="text-xs text-gray-500 mb-4">Cerrado el {cycleClosesAt}.</p>
            )}
            {isCycle && showRestrictedContent && request.ai_interpretation && (
              <div className="mb-8 border rounded-lg p-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Interpretación de tu perfil{" "}
                  <span className="font-normal text-gray-400">
                    (generado por IA, competencias y saboteadores juntos)
                  </span>
                </p>
                <div className="text-sm text-gray-700 flex flex-col gap-3 whitespace-pre-line">
                  {request.ai_interpretation}
                </div>
              </div>
            )}
            {isCycle ? (
              <CompetencyComparison rows={competencyComparison} byCategoryRows={competencyByCategory} />
            ) : (
              <CompetencyNarrativeReport rows={competencyNarrative} />
            )}
            {isCycle && showRestrictedContent && <SaboteadoresReport rows={saboteadores} />}
            <QuestionGroupList groups={peerGroups} />
          </>
        )}
      </section>
    </main>
  );
}
