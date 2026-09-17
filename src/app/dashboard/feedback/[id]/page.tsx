import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import * as aiInterpretationManager from "@/server/managers/aiInterpretationManager";
import type {
  CompetencyNarrativeRow,
  CompetencyComparisonRow,
  CompetencyByCategoryRow,
  SaboteadorRow,
} from "@/server/managers/feedbackManager";
import {
  cancelFeedbackRequest,
  closeFeedbackRequest,
  updateFeedbackRequestEvaluators,
  updateFeedbackRequestEvaluatorsForIndividual,
} from "@/app/actions/feedback";
import { finalizeCycleRequest } from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import CompetencyComparisonChart from "@/components/CompetencyComparisonChart";
import { GROUP_COLORS, GROUP_LABELS } from "@/components/CompetencyRadar";
import { SABOTEADOR_LABELS } from "@/lib/aiInterpretation";
import InterpretationText from "@/components/InterpretationText";
import FinalizeReportButton from "@/components/FinalizeReportButton";
import Card from "@/components/ui/Card";
import ErrorBanner from "@/components/ui/ErrorBanner";

type QuestionGroup = {
  prompt: string;
  position: number;
  answers: string[];
};

// Solo preguntas abiertas sin competencia asociada — las de escala y las
// de tipo "competency" van al resumen agregado (CompetencySummaryTable),
// no se listan respuesta por respuesta.
async function loadQuestionGroups(requestId: string, isSelf: boolean): Promise<QuestionGroup[]> {
  const rows = await feedbackManager.getFeedbackRequestAnswers(requestId, isSelf);

  const groupsByPrompt = new Map<string, QuestionGroup>();
  for (const row of rows) {
    if (row.questionType !== "open") continue;
    if (!row.questionPrompt) continue;
    if (!row.answerText) continue;
    const prompt = row.questionPrompt;
    const position = row.questionPosition ?? 0;
    if (!groupsByPrompt.has(prompt)) {
      groupsByPrompt.set(prompt, { prompt, position, answers: [] });
    }
    groupsByPrompt.get(prompt)!.answers.push(row.answerText);
  }
  return Array.from(groupsByPrompt.values()).sort((a, b) => a.position - b.position);
}

function QuestionGroupList({ groups }: { groups: QuestionGroup[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.prompt}>
          <h3 className="text-sm font-semibold text-ink mb-3">{group.prompt}</h3>
          <div className="flex flex-col gap-3">
            {group.answers.map((answer, index) => (
              <p key={index} className="text-sm text-ink-soft">
                {answer}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    if (!byQuestion.has(row.questionPosition)) {
      byQuestion.set(row.questionPosition, { prompt: row.questionPrompt, rows: [] });
    }
    byQuestion.get(row.questionPosition)!.rows.push(row);
  }
  const questions = Array.from(byQuestion.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="mb-8 flex flex-col gap-8">
      {questions.map(([position, { prompt, rows: qRows }]) => (
        <div key={position}>
          <p className="text-base font-semibold text-ink mb-3">
            {NARRATIVE_HEADLINES[position] || prompt}
          </p>
          <div className="flex flex-col divide-y divide-line">
            {qRows.map((row) => {
              const groupCode = row.roleCode || "plenitud";
              const color = GROUP_COLORS[groupCode] || "#6b7280";
              const dimension = GROUP_LABELS[groupCode] || groupCode;
              return (
                <div key={row.competencyCode} className="pt-4 first:pt-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {row.competencyName || row.competencyCode}
                      <span className="text-ink-soft font-normal">({dimension})</span>
                    </p>
                    <span className="text-xs text-ink-soft shrink-0">
                      {row.mentionCount === 1 ? "1 mención" : `${row.mentionCount} menciones`}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft mt-0.5">Nota media {row.avgValue} / 5</p>
                  {row.comments && row.comments.length > 0 && (
                    <ul className="flex flex-col gap-1.5 mt-2.5">
                      {row.comments.map((comment, i) => (
                        <li key={i} className="text-sm text-ink-soft pl-3" style={{ borderLeft: `2px solid ${color}` }}>
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
    code: row.competencyCode,
    name: row.competencyName,
    groupCode: row.roleCode || "plenitud",
    peerAvgValue: row.peerAvgValue,
    selfValue: row.selfValue,
  }));

  const byCategory = new Map<string, Record<string, number>>();
  for (const row of byCategoryRows) {
    if (!byCategory.has(row.evaluatorCategory)) {
      byCategory.set(row.evaluatorCategory, {});
    }
    byCategory.get(row.evaluatorCategory)![row.competencyCode] = row.avgValue;
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

// Datos crudos de los 5 saboteadores (no solo el párrafo de la IA) —
// mismo lenguaje visual que la tabla de CompetencyComparisonChart, pero
// sin columna de "media de compañeros": estas preguntas son solo de
// autoevaluación por diseño (migración 0061), nunca se le piden al
// grupo evaluador, así que aquí no hay "donde me ven", solo "donde me
// veo".
function SaboteadoresReport({ rows }: { rows: SaboteadorRow[] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.avgValue - a.avgValue);
  return (
    <div className="mb-8">
      <p className="text-sm font-medium text-ink-soft mb-1">Tus saboteadores</p>
      <p className="text-xs text-ink-soft mb-4">
        Solo autoevaluación — nadie más puntúa esto, así que no hay una media de
        compañeros con la que compararlo.
      </p>
      <div className="flex flex-col gap-3">
        {sorted.map((row) => {
          const label = SABOTEADOR_LABELS[row.saboteadorCode] || row.saboteadorCode;
          // Tono ya-existente para saboteadores (DESIGN.md), deliberadamente
          // más suave que el radar de competencias -- nunca rojo/coral.
          const color = row.isHigh ? "var(--saboteador-tint)" : "var(--ink-soft)";
          return (
            <div key={row.saboteadorCode}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span
                  className="font-medium"
                  style={{ color: row.isHigh ? "var(--saboteador-tint)" : "var(--ink)" }}
                >
                  {label}
                </span>
                <span className="text-ink-soft">{row.avgValue.toFixed(1)} / 5</span>
              </div>
              <div className="h-2 rounded-brujula-sm bg-saboteador-wash overflow-hidden">
                <div
                  className="h-full rounded-brujula-sm"
                  style={{ width: `${(row.avgValue / 5) * 100}%`, backgroundColor: color }}
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

  const user = await authManager.getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();
  const state = await feedbackManager.getRequestState(id);

  if (!state || !currentMember || state.request.requesterMemberId !== currentMember.id) {
    redirect("/dashboard");
  }

  // status/eligibility facts (request status + response-count-vs-threshold)
  // come from feedbackManager.getRequestState now -- the single
  // manager-computed source of truth shared with [id]/gestionar/page.tsx's
  // own canManageCycle/canFullyEditCycle, instead of each page reimplementing
  // its own formula over the same underlying facts.
  const { request, progress, totalInvitees, totalResponseCount, isCycle, isFinal } = state;

  const revealed = progress?.revealed ?? false;

  const cycleClosesAt: string | null = request.closesAt ?? null;

  // Comentarios de texto (y la interpretación de IA, más abajo) de un 360
  // esperan a que el solicitante lo finalice — nunca solo con el 80%. En
  // el flujo ágil, que no se tocó, siguen mostrándose en cuanto se revela.
  const showRestrictedContent = revealed && (!isCycle || isFinal);

  // La autoevaluación no se muestra aquí (texto/escala en crudo): queda
  // guardada para una futura comparativa con gráfica frente a la media
  // global o por grupos, no para listarla tal cual en esta vista.
  const peerGroups = showRestrictedContent ? await loadQuestionGroups(id, false) : [];

  const cycleName = request.cycleName;
  // "Ciclo 360 " / "Feedback ágil " es siempre el prefijo — la persona
  // solo escribe lo que sigue (ver el label de cada formulario de
  // creación, que ya deja esto claro para no duplicar palabras).
  const fallbackDate = `del ${new Date(request.createdAt).toLocaleDateString("es-ES")}`;
  const requestLabel = isCycle
    ? `Ciclo 360 ${cycleName || request.name || fallbackDate}`
    : `Feedback ágil ${request.name || fallbackDate}`;

  const competencyNarrative =
    revealed && !isCycle ? await feedbackManager.getCompetencyNarrative(id) : [];

  const competencyComparison =
    revealed && isCycle ? await feedbackManager.getRequestCompetencyComparison(id) : [];

  const competencyByCategory =
    revealed && isCycle ? await feedbackManager.getRequestCompetencyByCategory(id) : [];

  const saboteadores =
    isCycle && showRestrictedContent ? await feedbackManager.getRequestSaboteadores(id) : [];

  // Story 7.3: la interpretación por IA en 3 partes (competencias /
  // saboteadores / resumen de respuestas abiertas), y el catálogo de
  // competencias (con descripción) que InterpretationText usa para
  // resaltar cada mención con su tooltip -- mismo dato que ya usa la
  // Biblioteca, sin duplicar texto. Ambos solo se leen cuando de verdad
  // van a mostrarse, mismo guard que el resto del contenido restringido.
  const savedInterpretation =
    isCycle && showRestrictedContent ? await aiInterpretationManager.getSavedProfileInterpretation(id) : null;

  const competencyDescriptions = savedInterpretation
    ? (await membersManager.listCompetencyFrameworks())
        .filter((f): f is typeof f & { description: string } => Boolean(f.description))
        .map((f) => ({ name: f.name, description: f.description }))
    : [];

  const isAdHocOpen = request.requestType === "ad_hoc" && request.status === "open";
  const canManage = isAdHocOpen && totalResponseCount === 0;

  // Solo para decidir si se muestra el enlace a "Gestionar evaluadores" —
  // esa página (feedback/[id]/gestionar) hace su propia comprobación
  // completa de si todavía se puede modificar algo.
  const canLinkToManageCycle = isCycle && request.status === "open" && !isFinal;

  const isIndividualAccount = currentMember.organization?.kind === "individual";

  let colleagues: ColleagueRow[] | null = null;
  let currentInviteeIds: string[] = [];
  let currentInviteeEmails: string[] = [];
  let minInvitees = 5;
  if (canManage) {
    minInvitees = await feedbackManager.getMinInviteesPerRequest(currentMember.organizationId);

    if (isIndividualAccount) {
      const invitations = await feedbackManager.getFeedbackRequestEmailInvitations(id);
      currentInviteeEmails = invitations.map((i) => i.email);
    } else {
      const colleaguesRaw = await feedbackManager.getEvaluatorCandidates(currentMember.id);
      colleagues = colleaguesRaw.map((c) => ({ id: c.id, email: c.email, full_name: c.fullName }));

      currentInviteeIds = await feedbackManager.getFeedbackRequestInviteeMemberIds(id);
    }
  }

  // Story 7.6: reveal-progress and finalize-confirm copy moved to
  // platform_texts (supabase/migrations/0089_simplify_reveal_and_finalize_
  // texts.sql) -- same mechanism as every other editable text in this app,
  // replacing the hardcoded strings below (including the old 80%-of-
  // responses branch, which get_feedback_request_progress no longer
  // computes at all: `revealed` already reflects the simplified condition
  // by the time it reaches this page, so there is nothing left here to
  // branch on). `feedbackManager.getPlatformText` is an existing export --
  // read-only import, no edit to that file.
  const [progressPendingMessage, progressSelfReminder, finalizeConfirmMessage] = await Promise.all([
    feedbackManager.getPlatformText(
      "progress_pending_message",
      "Han respondido {respondidas} de {necesarias} necesarias para poder ver algo. Nadie sabe quién ha respondido ya."
    ),
    feedbackManager.getPlatformText(
      "progress_pending_self_reminder",
      "Además, hasta que no hagas tu propia autoevaluación tampoco podrás ver cómo te ven los demás."
    ),
    feedbackManager.getPlatformText(
      "finalize_confirm_message",
      "Si finalizas tu informe ahora, {pendientes} personas que todavía no han respondido no tendrán opción de hacerlo. ¿Seguro que quieres finalizarlo?"
    ),
  ]);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">{requestLabel}</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {request.status === "closed" && (
        <p className="mb-6 rounded-brujula-md bg-surface-2 text-ink-soft text-sm p-3">
          Esta solicitud está {(progress?.responseCount ?? 0) > 0 ? "completada" : "cancelada"}.
        </p>
      )}

      {isAdHocOpen && (
        <Card className="mb-10">
          <p className="text-sm font-medium text-ink mb-3">Gestionar solicitud</p>

          {canManage ? (
            <>
              <p className="text-xs text-ink-soft mb-4">
                Todavía nadie ha respondido, así que puedes cambiar a quién
                invitaste o cancelarla.
              </p>
              {isIndividualAccount ? (
                <form
                  action={updateFeedbackRequestEvaluatorsForIndividual}
                  className="flex flex-col gap-3 mb-4"
                >
                  <input type="hidden" name="requestId" value={id} />
                  {
                    // canModifyExisting=true matches the member-id branch
                    // below (EvaluatorPicker, no canModifyExisting prop ->
                    // its own default also allows unchecking) -- deliberately
                    // consistent with it, not a new gap: the underlying RPC
                    // (update_ad_hoc_feedback_request_evaluators_for_individual,
                    // db/feedback.ts) is add-only regardless of this flag, so
                    // unchecking an already-invited email here is silently
                    // ignored server-side, same latent UX/RPC mismatch its
                    // sibling already has (deferred-work.md).
                  }
                  <EmailEvaluatorPicker
                    fieldName="inviteeEmails"
                    minEmails={minInvitees}
                    defaultEmails={currentInviteeEmails}
                    canModifyExisting
                    submitLabel="Guardar cambios"
                  />
                </form>
              ) : (
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
              )}
              <form action={cancelFeedbackRequest} className="inline">
                <input type="hidden" name="requestId" value={id} />
                <button type="submit" className="text-sm underline text-ink-soft hover:text-ink">
                  Cancelar solicitud
                </button>
              </form>
            </>
          ) : (
            <p className="text-xs text-ink-soft mb-4">
              Ya hay respuestas, así que no se puede cancelar ni cambiar a
              quién invitaste. Cuando ya no necesites seguir recibiendo
              respuestas, márcala como completada para poder pedir feedback
              de nuevo.
            </p>
          )}

          <form action={closeFeedbackRequest} className="mt-3">
            <input type="hidden" name="requestId" value={id} />
            <button type="submit" className="text-sm underline text-ink-soft hover:text-ink">
              Marcar como completada
            </button>
          </form>
        </Card>
      )}

      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-medium text-ink-soft">Respuestas de compañeros</h2>
          {isCycle && canLinkToManageCycle && (
            <Link
              href={`/dashboard/feedback/${id}/gestionar`}
              className="text-xs underline text-ink-soft"
            >
              Gestionar evaluadores
            </Link>
          )}
          {revealed && (
            <span
              className={
                "text-xs font-caption text-caption rounded-full px-2 py-0.5 " +
                (isFinal ? "bg-indigo-wash text-indigo-deep" : "bg-surface-2 text-ink-soft")
              }
            >
              {isFinal ? "definitivo" : "preliminar"}
            </span>
          )}
        </div>
        {!revealed ? (
          // Threshold-not-met (EXPERIENCE.md "Threshold empty state"):
          // reassuring progress copy in indigo-wash, never gray/red -- this
          // is progress, not failure. No RevealButton exists yet (there's
          // nothing to reveal).
          <div className="rounded-brujula-md bg-indigo-wash text-ink text-sm p-4">
            <p>
              {progressPendingMessage
                .replaceAll("{respondidas}", String(progress?.responseCount ?? 0))
                .replaceAll("{necesarias}", String(progress?.threshold ?? 3))}
              {isCycle && !progress?.selfResponded && <> {progressSelfReminder}</>}
            </p>
          </div>
        ) : (
          <>
            {!isFinal && !isCycle && (
              <p className="text-xs text-ink-soft mb-4">
                Todavía puede cambiar: faltan respuestas por llegar
                {cycleClosesAt ? ` o que se cierre el ${cycleClosesAt}` : ""}.
              </p>
            )}
            {isCycle && !isFinal && (
              <Card className="mb-6">
                <p className="text-xs text-ink-soft mb-3">
                  Es preliminar: de momento solo ves los datos agregados. Han
                  respondido {totalResponseCount} de {totalInvitees} evaluadores.
                  Los comentarios de texto y la interpretación de tu perfil se
                  desbloquean cuando tú decidas finalizarlo — no antes, y no
                  automáticamente.
                </p>
                <FinalizeReportButton
                  requestId={id}
                  action={finalizeCycleRequest}
                  // Ideally this "still-pending" count would be a manager-
                  // computed field on FeedbackRequestState (same convention
                  // as getRequestHeadlineSummary just above), not arithmetic
                  // here -- but that needs a feedbackManager.ts edit, and
                  // this file's own scope for this story is the
                  // reveal-condition text, not a new manager export in a
                  // file owned by a parallel story right now. Low-stakes:
                  // feeds only this confirm dialog's display copy, never a
                  // branch/decision.
                  confirmMessage={finalizeConfirmMessage.replaceAll(
                    "{pendientes}",
                    String(Math.max(totalInvitees - totalResponseCount, 0))
                  )}
                />
              </Card>
            )}
            {isCycle && isFinal && cycleClosesAt && (
              <p className="text-xs text-ink-soft mb-4">Cerrado el {cycleClosesAt}.</p>
            )}
            {isCycle && showRestrictedContent && savedInterpretation?.competencias && (
              <Card className="mb-8 max-w-prose">
                <p className="text-xs font-semibold text-ink-soft mb-2">
                  Interpretación de tu perfil{" "}
                  <span className="font-normal text-ink-soft">(generado por IA)</span>
                </p>
                <div className="text-sm text-ink leading-relaxed">
                  <InterpretationText text={savedInterpretation.competencias} competencies={competencyDescriptions} />
                </div>
              </Card>
            )}
            {isCycle ? (
              <CompetencyComparison rows={competencyComparison} byCategoryRows={competencyByCategory} />
            ) : (
              <CompetencyNarrativeReport rows={competencyNarrative} />
            )}
            {isCycle && showRestrictedContent && savedInterpretation?.saboteadores && (
              <Card className="mb-4 max-w-prose">
                <p className="text-xs font-semibold text-ink-soft mb-2">
                  Sobre tus saboteadores{" "}
                  <span className="font-normal text-ink-soft">(generado por IA)</span>
                </p>
                <div className="text-sm text-ink leading-relaxed">
                  <InterpretationText text={savedInterpretation.saboteadores} competencies={competencyDescriptions} />
                </div>
              </Card>
            )}
            {isCycle && showRestrictedContent && <SaboteadoresReport rows={saboteadores} />}
            {isCycle && showRestrictedContent && savedInterpretation?.resumenAbiertas && (
              <Card className="mb-4 max-w-prose">
                <p className="text-xs font-semibold text-ink-soft mb-2">
                  Resumen de las respuestas abiertas{" "}
                  <span className="font-normal text-ink-soft">(generado por IA)</span>
                </p>
                <div className="text-sm text-ink leading-relaxed">
                  <InterpretationText
                    text={savedInterpretation.resumenAbiertas}
                    competencies={competencyDescriptions}
                  />
                </div>
              </Card>
            )}
            <QuestionGroupList groups={peerGroups} />
          </>
        )}
      </section>
    </main>
  );
}
