// Story 1.2 (_bmad-output/implementation-artifacts/
// spec-1-2-db-access-manager-scaffolding-report-groups.md): manager layer
// for the report-group AI interpretation step. Split out of
// src/lib/aiInterpretation.ts's `generateReportGroupInterpretation`
// (unmodified by this story, still used as-is by
// src/app/actions/reportGroups.ts until Stories 1.5/1.6): only
// prompt-building, the Anthropic fetch, and orchestration live here now --
// its one RPC call moved to `@/server/db/aiInterpretations`. Prompt text
// and fetch shape are copied verbatim from the original (lines 194-227 of
// that file) so this story's manager-level tests re-verify true behavioral
// equivalence, not just a structural rewrite.
//
// Never imports @supabase/supabase-js or @supabase/ssr directly, and never
// calls redirect()/revalidatePath() -- those stay one layer up (Story 1.6).
// Never throws: mirrors the original function's contract exactly (missing
// API key, empty summary, RPC failure, or a failed/erroring Anthropic call
// all resolve to `null`, never an exception) so `reportGroupsManager.closeGroup`
// can invoke it best-effort without its own try/catch.
//
// Story 7.3: adds the individual-profile (360) side of AI interpretation,
// `generateProfileInterpretation`/`saveProfileInterpretation`/
// `getSavedProfileInterpretation` -- ported and rewritten from
// src/lib/aiInterpretation.ts's `generateAiInterpretation`, which took a
// raw SupabaseClient (the 3rd and last eslint.config.mjs `no-restricted-
// imports` exemption, src/app/actions/cycles.ts). Same graceful-
// degradation contract as generateReportGroupInterpretation below: missing
// ANTHROPIC_API_KEY, an empty comparison, or a failed/erroring Anthropic
// call all resolve to `null`, never an exception -- actions/cycles.ts can
// call it best-effort exactly like closeGroup does here. Now also feeds it
// peer open-text answers (theme synthesis only, never verbatim quotes) and
// per-competency thresholds (migration 0079_competency_thresholds.sql),
// and splits the single result into 3 parts (competencias/saboteadores/
// resumenAbiertas) via 2 literal markers the model is asked to emit,
// mirroring the original's own marker-split approach exactly.

import "server-only";
import { getReportGroupCompetencySummary, getSavedProfileInterpretation as dbGetSavedProfileInterpretation, saveProfileInterpretation as dbSaveProfileInterpretation } from "@/server/db/aiInterpretations";
import {
  getRequestCompetencyComparison,
  getRequestCompetencyByCategory,
  getRequestSaboteadores,
  getFeedbackRequestAnswers,
  type CompetencyComparisonRow,
  type CompetencyByCategoryRow,
} from "@/server/db/feedback";
import { listCompetencyFrameworks } from "@/server/managers/membersManager";
import { SABOTEADOR_LABELS } from "@/lib/aiInterpretation";

export type { SavedProfileInterpretation } from "@/server/db/aiInterpretations";

const MODEL = "claude-haiku-4-5-20251001";

const CATEGORY_LABELS: Record<string, string> = {
  manager: "jefe/responsable directo",
  team: "compañeros de equipo",
  organization: "compañeros de la empresa",
  other: "otros",
};

const SABOTEADORES_MARKER = "---SABOTEADORES---";
const RESPUESTAS_ABIERTAS_MARKER = "---RESPUESTAS_ABIERTAS---";

export type AiProfileInterpretationResult = {
  competencias: string;
  saboteadores: string | null;
  resumenAbiertas: string | null;
};

/**
 * Individual-profile (360) AI interpretation (spec.md sección 17) -- called
 * once, when `finalizeCycleRequest` (src/app/actions/cycles.ts) closes a
 * cycle request. Composes 5 reads (comparison, by-category, saboteadores,
 * peer open-text answers, competency thresholds), builds one prompt asking
 * the model to emit 3 parts separated by 2 literal markers, and splits the
 * response back apart. Never throws -- see file header.
 */
export async function generateProfileInterpretation(requestId: string): Promise<AiProfileInterpretationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const [comparison, byCategory, saboteadores, openAnswers, frameworks] = await Promise.all([
      getRequestCompetencyComparison(requestId),
      getRequestCompetencyByCategory(requestId),
      getRequestSaboteadores(requestId),
      // Mismo dato que ya se muestra tal cual en el informe
      // (QuestionGroupList, dashboard/feedback/[id]/page.tsx) -- no hace
      // falta ninguna RPC nueva. Solo respuestas de compañeros (isSelf =
      // false), nunca la autoevaluación.
      getFeedbackRequestAnswers(requestId, false),
      // Umbrales (qué indica un valor alto/bajo, migración 0079) -- se
      // pasan siempre los 16, no solo los mencionados en el resto del
      // prompt, porque es la propia IA quien decide qué destacar.
      listCompetencyFrameworks(),
    ]);

    if (comparison.length === 0) return null;

    const byCategoryByCompetency = new Map<string, Record<string, number>>();
    for (const row of byCategory as CompetencyByCategoryRow[]) {
      if (!byCategoryByCompetency.has(row.competencyCode)) {
        byCategoryByCompetency.set(row.competencyCode, {});
      }
      byCategoryByCompetency.get(row.competencyCode)![row.evaluatorCategory] = row.avgValue;
    }

    const lines = (comparison as CompetencyComparisonRow[]).map((row) => {
      const parts = [
        `${row.competencyName} (${row.roleName || "Plenitud"})`,
        `autoevaluación: ${row.selfValue ?? "sin dato"}`,
        `media de compañeros: ${row.peerAvgValue ?? "sin dato"}`,
      ];
      const categories = byCategoryByCompetency.get(row.competencyCode);
      if (categories && Object.keys(categories).length > 0) {
        parts.push(
          Object.entries(categories)
            .map(([cat, val]) => `${CATEGORY_LABELS[cat] || cat}: ${val}`)
            .join(", ")
        );
      }
      return `- ${parts.join(" · ")}`;
    });

    const highSaboteadores = saboteadores.filter((s) => s.isHigh);

    const openByPrompt = new Map<string, string[]>();
    for (const row of openAnswers) {
      if (row.questionType !== "open" || !row.questionPrompt || !row.answerText) continue;
      const key = row.questionPrompt;
      if (!openByPrompt.has(key)) openByPrompt.set(key, []);
      openByPrompt.get(key)!.push(row.answerText);
    }

    const thresholdLines = frameworks
      .filter((t) => t.thresholdHigh || t.thresholdLow)
      .map(
        (t) =>
          `- ${t.name}: valor alto = ${t.thresholdHigh || "sin dato"}; valor bajo = ${t.thresholdLow || "sin dato"}`
      )
      .join("\n");

    let prompt = `Eres un asistente que ayuda a interpretar el perfil de un informe de feedback 360 en Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño).

Datos de competencias (escala 1-5, "sin dato" cuando no aplica):
${lines.join("\n")}
${
  thresholdLines
    ? `\nPara referencia (qué indica un valor alto o bajo en cada competencia — úsalo para calibrar el tono de la interpretación, no lo copies literalmente ni lo cites como lista):\n${thresholdLines}\n`
    : ""
}
Escribe una interpretación en español, en 2ª persona ("tú"), en 3-4 párrafos cortos, con este contenido:
1. Qué destaca según la media de compañeros (2-3 competencias con nota más alta).
2. Los mayores gaps entre autoevaluación y media de compañeros, en ambos sentidos (te ves mejor o peor de lo que te ven) — como pregunta reflexiva, nunca como veredicto.
3. Si hay una divergencia notable entre categorías de evaluador (jefe vs equipo, etc.) en alguna competencia, coméntala.
4. Cierra con la competencia con más recorrido según la media general, sin alarmismo.`;

    if (highSaboteadores.length > 0) {
      const saboteadorLines = highSaboteadores
        .map((s) => `${SABOTEADOR_LABELS[s.saboteadorCode] || s.saboteadorCode}: ${s.avgValue}/5`)
        .join(", ");
      prompt += `

Esta persona se autoevaluó alto en los siguientes saboteadores (patrones de pensamiento limitantes, en el sentido de Shirzad Chamine/Positive Intelligence — no son competencias, no los relaciones con ninguna de la lista de arriba de forma fija ni causal): ${saboteadorLines}. Estos datos de saboteadores son SOLO de autoevaluación — nadie más los puntúa, así que no hables de "cómo te ven" para ellos.

Cuando termines la interpretación de competencias de arriba, añade en una línea aparte exactamente el texto "${SABOTEADORES_MARKER}" y, a continuación, un párrafo (o uno por saboteador si hay varios) sobre qué creencia o patrón puede haber detrás de cada saboteador alto — siempre en tono de hipótesis ("puede estar relacionado con...", "vale la pena explorar si..."), nunca de veredicto ("esto te está limitando"). Si algún gap o divergencia de los datos de competencias de arriba parece conectar con ese saboteador, puedes mencionarlo como refuerzo, pero no fuerces la conexión si no la hay. Esta parte va aparte, no la mezcles con la interpretación de competencias.`;
    }

    if (openByPrompt.size > 0) {
      const openLines = Array.from(openByPrompt.entries())
        .map(([q, answers]) => `Pregunta: "${q}"\n${answers.map((a) => `- ${a}`).join("\n")}`)
        .join("\n\n");
      prompt += `

Comentarios de texto libre que sus compañeros le han escrito (anonimizados, sin indicar quién escribió cada uno):
${openLines}

Cuando termines todo lo anterior, si en esos comentarios hay como máximo 1-2 temas que se repitan en varios comentarios de personas distintas (nunca a partir de un solo comentario aislado), añade en una línea aparte exactamente el texto "${RESPUESTAS_ABIERTAS_MARKER}" y, a continuación, un párrafo corto con ese resumen. No cites ningún comentario literalmente. Dilo explícitamente como una síntesis de las respuestas abiertas de sus compañeros (por ejemplo, "en las respuestas abiertas de tus compañeros se repite..."), para que quede claro que es un resumen de esas preguntas abiertas y no una competencia ni un saboteador más. Esta parte va aparte, no la mezcles con las anteriores. Si no hay ningún tema que se repita, no escribas ni el marcador ni esta parte.`;
    }

    prompt += `

Tono humanista, cercano, nunca de evaluación de desempeño, en las tres partes por igual. No uses listas ni encabezados en ninguna de ellas, solo párrafos de texto corrido separados por una línea en blanco.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1536,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const text = (data?.content?.[0]?.text as string | undefined)?.trim();
    if (!text) return null;

    let competencias = text;
    let saboteadoresText: string | null = null;
    let resumenAbiertas: string | null = null;

    if (competencias.includes(SABOTEADORES_MARKER)) {
      const [before, after] = competencias.split(SABOTEADORES_MARKER);
      competencias = before.trim();
      if (after.includes(RESPUESTAS_ABIERTAS_MARKER)) {
        const [sabo, abiertas] = after.split(RESPUESTAS_ABIERTAS_MARKER);
        saboteadoresText = sabo.trim() || null;
        resumenAbiertas = abiertas.trim() || null;
      } else {
        saboteadoresText = after.trim() || null;
      }
    } else if (competencias.includes(RESPUESTAS_ABIERTAS_MARKER)) {
      const [before, after] = competencias.split(RESPUESTAS_ABIERTAS_MARKER);
      competencias = before.trim();
      resumenAbiertas = after.trim() || null;
    }

    return { competencias, saboteadores: saboteadoresText, resumenAbiertas };
  } catch (e) {
    console.error("No se pudo generar la interpretación IA:", e);
    return null;
  }
}

/**
 * Persists a freshly generated `AiProfileInterpretationResult` (called from
 * `finalizeCycleRequest` right after `generateProfileInterpretation`, only
 * when it returned non-null). Never throws -- same graceful-degradation
 * contract as generation itself: a save failure here silently no-ops
 * rather than aborting the caller's redirect, matching the exact behavior
 * the original unmigrated call site had (db/cycles.ts's own
 * `saveAiInterpretation` doc comment documents that same swallowed-error
 * precedent for the single-argument RPC call this supersedes for the
 * profile-interpretation path).
 */
export async function saveProfileInterpretation(
  requestId: string,
  result: AiProfileInterpretationResult
): Promise<void> {
  try {
    await dbSaveProfileInterpretation(requestId, result.competencias, result.saboteadores, result.resumenAbiertas);
  } catch (e) {
    console.error("No se pudo guardar la interpretación IA del perfil:", e);
  }
}

/**
 * Reads back an already-saved 3-part interpretation for
 * dashboard/feedback/[id]/page.tsx to render -- the read-only counterpart
 * of saveProfileInterpretation above. Throws on a real read failure (RLS
 * denial, bad id); returns `null` when the row doesn't exist or isn't
 * visible. Callers gate this behind their own `showRestrictedContent`/
 * `isCycle` check, same as every other restricted-content read on that
 * page.
 */
export async function getSavedProfileInterpretation(requestId: string) {
  return dbGetSavedProfileInterpretation(requestId);
}

/**
 * Interpretación del informe de grupo (spec.md sección 17, "Informes de
 * grupo" -- fase 1) -- se llama una única vez, al cerrar el grupo
 * (reportGroupsManager.closeGroup). Mismo criterio que el perfil
 * individual: si falla o no hay clave, devuelve null sin reintento
 * automático.
 */
export async function generateReportGroupInterpretation(groupId: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const rows = await getReportGroupCompetencySummary(groupId);
    if (rows.length === 0) return null;

    const lines = rows.map(
      (row) =>
        `- ${row.competencyName} (${row.roleName || "Plenitud"}): media de evaluadores ${row.peerAvgValue ?? "sin dato"}, media de autopercepción ${row.selfAvgValue ?? "sin dato"}, ${row.memberCount} personas con dato`
    );

    const prompt = `Eres un asistente que ayuda a interpretar el perfil agregado de un grupo dentro de Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño). Cada competencia trae dos medias del grupo (escala 1-5), calculadas a partir del último 360 cerrado de cada miembro: la media de cómo les evalúan sus compañeros, y la media de cómo se autoevalúan ellos mismos — cada persona pesa igual, sin importar cuántos evaluadores tuvo.

Datos del grupo:
${lines.join("\n")}

Escribe una interpretación en español, en 2ª persona plural ("vuestro equipo", "como grupo"), en 2-3 párrafos cortos:
1. Qué competencias están más desarrolladas en el grupo según sus compañeros (2-3 con nota más alta).
2. Qué competencias tienen más recorrido en el grupo (2-3 con nota más baja) — sin alarmismo, en tono de oportunidad de desarrollo colectivo.
3. Si hay una competencia donde la autopercepción del grupo se aleja notablemente de cómo les ve el resto (en cualquier sentido), coméntala como pregunta reflexiva, nunca como veredicto.

Tono humanista, cercano, nunca de evaluación de desempeño ni de ranking entre personas — es un perfil de grupo, no de individuos. No uses listas ni encabezados, solo párrafos de texto corrido separados por una línea en blanco.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic API error:", res.status, await res.text());
      return null;
    }

    const responseData = await res.json();
    const text = (responseData?.content?.[0]?.text as string | undefined)?.trim();
    return text || null;
  } catch (e) {
    console.error("No se pudo generar la interpretación IA del grupo:", e);
    return null;
  }
}
