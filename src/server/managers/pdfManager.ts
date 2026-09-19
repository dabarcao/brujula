// Manager del PDF del informe 360 individual (docs/spec.md sección 17).
// Reutiliza exactamente las mismas comprobaciones de permiso y las mismas
// lecturas que src/app/dashboard/feedback/[id]/page.tsx (nunca las
// reimplementa distinto) -- solo compone el resultado en el shape plano
// que espera infra/pdf.ts, en vez de JSX. Nunca importa @react-pdf/renderer
// directamente (eso vive solo en infra/pdf.ts).

import "server-only";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import * as aiInterpretationManager from "@/server/managers/aiInterpretationManager";
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import { renderIndividual360Pdf, renderGroupReportPdf } from "@/server/infra/pdf";
import type { PdfChartAxis, PdfChartCategorySeries } from "@/server/infra/pdf/radarChart";

async function loadOpenQuestions(requestId: string) {
  const rows = await feedbackManager.getFeedbackRequestAnswers(requestId, false);
  const byPrompt = new Map<string, { prompt: string; position: number; answers: string[] }>();
  for (const row of rows) {
    if (row.questionType !== "open") continue;
    if (!row.questionPrompt) continue;
    if (!row.answerText) continue;
    if (!byPrompt.has(row.questionPrompt)) {
      byPrompt.set(row.questionPrompt, { prompt: row.questionPrompt, position: row.questionPosition ?? 0, answers: [] });
    }
    byPrompt.get(row.questionPrompt)!.answers.push(row.answerText);
  }
  return Array.from(byPrompt.values()).sort((a, b) => a.position - b.position);
}

/**
 * Compone los datos del PDF del informe 360, con la MISMA regla de acceso
 * que la pantalla web: solo el propio solicitante, y solo cuando el
 * contenido restringido ya está desbloqueado (360 finalizado por su
 * dueño -- nunca solo por el 80% de respuestas, spec.md sección 4.1).
 * Lanza un Error con mensaje pensado para mostrarse tal cual si algo de
 * esto no se cumple.
 */
export async function generateIndividual360Pdf(requestId: string): Promise<Buffer> {
  const user = await authManager.getCurrentUser();
  if (!user) {
    throw new Error("Debes iniciar sesión para descargar este informe.");
  }

  const currentMember = await membersManager.getCurrentMember();
  const state = await feedbackManager.getRequestState(requestId);

  if (!state || !currentMember || state.request.requesterMemberId !== currentMember.id) {
    throw new Error("Este informe no existe o no te pertenece.");
  }

  const { request, isCycle, isFinal, progress } = state;
  const revealed = progress?.revealed ?? false;
  const showRestrictedContent = revealed && (!isCycle || isFinal);

  if (!isCycle || !showRestrictedContent) {
    throw new Error("Todavía no puedes descargar el PDF: finaliza tu 360 primero.");
  }

  const [
    competencyComparison,
    competencyByCategory,
    saboteadores,
    openQuestions,
    savedInterpretation,
    frameworks,
  ] = await Promise.all([
    feedbackManager.getRequestCompetencyComparison(requestId),
    feedbackManager.getRequestCompetencyByCategory(requestId),
    feedbackManager.getRequestSaboteadores(requestId),
    loadOpenQuestions(requestId),
    aiInterpretationManager.getSavedProfileInterpretation(requestId),
    membersManager.listCompetencyFrameworks(),
  ]);

  const competencyDescriptions = savedInterpretation
    ? frameworks
        .filter((f): f is typeof f & { description: string } => Boolean(f.description))
        .map((f) => ({ name: f.name, description: f.description }))
    : [];

  const axes: PdfChartAxis[] = competencyComparison.map((row) => ({
    code: row.competencyCode,
    name: row.competencyName,
    groupCode: row.roleCode || "plenitud",
    peerAvgValue: row.peerAvgValue,
    selfValue: row.selfValue,
  }));

  const byCategory = new Map<string, Record<string, number>>();
  for (const row of competencyByCategory) {
    if (!byCategory.has(row.evaluatorCategory)) byCategory.set(row.evaluatorCategory, {});
    byCategory.get(row.evaluatorCategory)![row.competencyCode] = row.avgValue;
  }
  const categorySeries: PdfChartCategorySeries[] = Array.from(byCategory.entries()).map(
    ([category, valuesByCode]) => ({ category, valuesByCode })
  );

  const cycleName = request.cycleName;
  const fallbackDate = `del ${new Date(request.createdAt).toLocaleDateString("es-ES")}`;
  const requestLabel = `Ciclo 360 ${cycleName || request.name || fallbackDate}`;
  const closedAtLabel = request.closesAt
    ? new Date(request.closesAt).toLocaleDateString("es-ES")
    : null;

  return renderIndividual360Pdf({
    personName: currentMember.fullName || user.email || "Alguien",
    requestLabel,
    closedAtLabel,
    interpretation: savedInterpretation
      ? {
          competencias: savedInterpretation.competencias,
          saboteadores: savedInterpretation.saboteadores,
          resumenAbiertas: savedInterpretation.resumenAbiertas,
        }
      : null,
    competencyDescriptions,
    axes,
    categorySeries,
    saboteadores,
    openQuestions,
  });
}

/**
 * Compone los datos del PDF del informe de grupo, con la MISMA regla de
 * acceso que la pantalla web -- pero a diferencia del individual, aquí no
 * hace falta reimplementarla: getGroup/getGroupCompetencySummary (RPCs
 * security definer) ya comprueban internamente "eres el creador o ya
 * aceptaste" y "el grupo está cerrado", y lanzan con el mismo mensaje que
 * vería la pantalla si no se cumple.
 */
export async function generateGroupReportPdf(groupId: string): Promise<Buffer> {
  const group = await reportGroupsManager.getGroup(groupId);

  if (group.status !== "closed") {
    throw new Error("Todavía no puedes descargar el PDF: el informe de grupo no está cerrado.");
  }

  const [competencySummary, frameworks] = await Promise.all([
    reportGroupsManager.getGroupCompetencySummary(groupId),
    membersManager.listCompetencyFrameworks(),
  ]);

  const competencyDescriptions =
    group.aiInterpretation || group.aiOpenPatternsText
      ? frameworks
          .filter((f): f is typeof f & { description: string } => Boolean(f.description))
          .map((f) => ({ name: f.name, description: f.description }))
      : [];

  const axes: PdfChartAxis[] = competencySummary.map((row) => ({
    code: row.competencyCode,
    name: row.competencyName,
    groupCode: row.roleCode || "plenitud",
    peerAvgValue: row.peerAvgValue,
    selfValue: row.selfAvgValue,
  }));

  return renderGroupReportPdf({
    groupName: group.name,
    memberCount: group.acceptedCount,
    interpretation: group.aiInterpretation,
    openPatterns: group.aiOpenPatternsText,
    competencyDescriptions,
    axes,
  });
}
