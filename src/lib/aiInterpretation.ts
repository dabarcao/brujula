import type { SupabaseClient } from "@supabase/supabase-js";

// Genera la interpretación del perfil 360 (spec.md sección 17) — se
// llama una única vez, en el momento de finalizar el informe
// (finalizeCycleRequest, src/app/actions/cycles.ts). Si falla o no hay
// clave configurada, devuelve null y no se reintenta solo — el usuario
// puede volver a intentarlo más adelante (mecanismo de reintento
// todavía sin diseñar).

type ComparisonRow = {
  competency_code: string;
  competency_name: string;
  role_name: string | null;
  self_value: number | null;
  peer_avg_value: number | null;
};

type ByCategoryRow = {
  competency_code: string;
  evaluator_category: string;
  avg_value: number;
};

type SaboteadorRow = {
  saboteador_code: string;
  avg_value: number;
  is_high: boolean;
};

type OpenAnswerRow = {
  answer_text: string | null;
  survey_questions: { prompt: string; position: number; question_type: string } | null;
  feedback_responses: { is_self: boolean } | null;
};

type FrameworkThresholdRow = {
  code: string;
  name: string;
  threshold_high: string | null;
  threshold_low: string | null;
};

// El modelo escribe las 3 partes en una sola llamada (más barato y más
// coherente entre sí que 3 llamadas sueltas) pero separadas con
// marcadores literales, para poder guardarlas y mostrarlas por separado
// más adelante si se decide así — de momento la página las sigue
// concatenando en un único bloque visual.
export type AiInterpretationResult = {
  competencias: string;
  saboteadores: string | null;
  resumenAbiertas: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  manager: "jefe/responsable directo",
  team: "compañeros de equipo",
  organization: "compañeros de la empresa",
  other: "otros",
};

// Sin vincular a ninguna competencia ni rol VACC a propósito (spec.md
// sección 15, mismo principio que Plenitud↔roles) — solo para mostrar el
// nombre legible del código guardado en survey_questions.saboteador_code.
// Exportado: también lo usa la tabla de datos crudos de saboteadores en
// feedback/[id]/page.tsx.
export const SABOTEADOR_LABELS: Record<string, string> = {
  controlador: "Controlador",
  evitador: "Evitador",
  hiperracional: "Hiperracional",
  complaciente: "Complaciente",
  perfeccionista: "Perfeccionista",
};

const MODEL = "claude-haiku-4-5-20251001";
const SABOTEADORES_MARKER = "---SABOTEADORES---";
const RESPUESTAS_ABIERTAS_MARKER = "---RESPUESTAS_ABIERTAS---";

export async function generateAiInterpretation(
  supabase: SupabaseClient,
  requestId: string
): Promise<AiInterpretationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const [
    { data: comparisonData },
    { data: byCategoryData },
    { data: saboteadoresData },
    { data: openAnswersData },
    { data: thresholdsData },
  ] = await Promise.all([
    supabase.rpc("get_request_competency_comparison", { p_request_id: requestId }),
    supabase.rpc("get_request_competency_by_category", { p_request_id: requestId }),
    supabase.rpc("get_request_saboteadores", { p_request_id: requestId }),
    // Mismo dato que ya se muestra tal cual en el informe (QuestionGroupList,
    // feedback/[id]/page.tsx) — no hace falta ninguna RPC nueva, el mismo
    // supabase client de aquí ya tiene el contexto de sesión necesario.
    supabase
      .from("feedback_answers")
      .select(
        "answer_text, survey_questions(prompt, position, question_type), feedback_responses!inner(feedback_request_id, is_self)"
      )
      .eq("feedback_responses.feedback_request_id", requestId)
      .eq("feedback_responses.is_self", false),
    // Umbrales (qué indica un valor alto/bajo, migración 0078) — se pasan
    // siempre los 16, no solo los que salgan mencionados en el resto del
    // prompt, porque es la propia IA quien decide qué competencias
    // destacar en los puntos 1-4 de más abajo.
    supabase.from("competency_frameworks").select("code, name, threshold_high, threshold_low"),
  ]);

  const comparison = (comparisonData as ComparisonRow[] | null) || [];
  if (comparison.length === 0) return null;

  const byCategory = (byCategoryData as ByCategoryRow[] | null) || [];
  const byCategoryByCompetency = new Map<string, Record<string, number>>();
  for (const row of byCategory) {
    if (!byCategoryByCompetency.has(row.competency_code)) {
      byCategoryByCompetency.set(row.competency_code, {});
    }
    byCategoryByCompetency.get(row.competency_code)![row.evaluator_category] = row.avg_value;
  }

  const lines = comparison.map((row) => {
    const parts = [
      `${row.competency_name} (${row.role_name || "Plenitud"})`,
      `autoevaluación: ${row.self_value ?? "sin dato"}`,
      `media de compañeros: ${row.peer_avg_value ?? "sin dato"}`,
    ];
    const categories = byCategoryByCompetency.get(row.competency_code);
    if (categories && Object.keys(categories).length > 0) {
      parts.push(
        Object.entries(categories)
          .map(([cat, val]) => `${CATEGORY_LABELS[cat] || cat}: ${val}`)
          .join(", ")
      );
    }
    return `- ${parts.join(" · ")}`;
  });

  const highSaboteadores = ((saboteadoresData as SaboteadorRow[] | null) || []).filter(
    (s) => s.is_high
  );

  // Mismo agrupamiento por pregunta que ya usa QuestionGroupList en el
  // informe — el texto libre se manda tal cual, sin resumir por nuestra
  // cuenta, es la propia IA quien sintetiza (instrucción más abajo).
  const openByPrompt = new Map<string, string[]>();
  for (const row of (openAnswersData as unknown as OpenAnswerRow[] | null) || []) {
    if (!row.survey_questions || row.survey_questions.question_type !== "open") continue;
    if (!row.answer_text) continue;
    const key = row.survey_questions.prompt;
    if (!openByPrompt.has(key)) openByPrompt.set(key, []);
    openByPrompt.get(key)!.push(row.answer_text);
  }

  const thresholdLines = ((thresholdsData as FrameworkThresholdRow[] | null) || [])
    .filter((t) => t.threshold_high || t.threshold_low)
    .map(
      (t) =>
        `- ${t.name}: valor alto = ${t.threshold_high || "sin dato"}; valor bajo = ${t.threshold_low || "sin dato"}`
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
      .map((s) => `${SABOTEADOR_LABELS[s.saboteador_code] || s.saboteador_code}: ${s.avg_value}/5`)
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

  try {
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

type NarrativeRow = {
  competency_code: string;
  competency_name: string | null;
  avg_value: number;
  mention_count: number;
};

export type AdHocInterpretationResult = {
  resumen: string;
  resumenAbiertas: string | null;
};

// Interpretación de una solicitud de "feedback ágil" (ad_hoc) — a
// diferencia del 360, no hay autoevaluación con la que comparar ni
// saboteadores (esa plantilla no los tiene), así que es un prompt más
// corto. Se llama al cerrar la solicitud (closeFeedbackRequest,
// src/app/actions/feedback.ts) — mismo criterio de "una vez, sin
// reintento automático" que el resto de interpretaciones.
export async function generateAdHocInterpretation(
  supabase: SupabaseClient,
  requestId: string
): Promise<AdHocInterpretationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const [{ data: narrativeData }, { data: openAnswersData }, { data: thresholdsData }] =
    await Promise.all([
      supabase.rpc("get_request_competency_narrative", { p_request_id: requestId }),
      supabase
        .from("feedback_answers")
        .select(
          "answer_text, survey_questions(prompt, question_type), feedback_responses!inner(feedback_request_id)"
        )
        .eq("feedback_responses.feedback_request_id", requestId),
      supabase.from("competency_frameworks").select("code, name, threshold_high, threshold_low"),
    ]);

  const narrative = (narrativeData as NarrativeRow[] | null) || [];
  if (narrative.length === 0) return null;

  const lines = narrative.map(
    (row) =>
      `- ${row.competency_name || row.competency_code}: media ${row.avg_value}/5, mencionada por ${row.mention_count} personas`
  );

  const openByPrompt = new Map<string, string[]>();
  for (const row of (openAnswersData as unknown as OpenAnswerRow[] | null) || []) {
    if (!row.survey_questions || row.survey_questions.question_type !== "open") continue;
    if (!row.answer_text) continue;
    const key = row.survey_questions.prompt;
    if (!openByPrompt.has(key)) openByPrompt.set(key, []);
    openByPrompt.get(key)!.push(row.answer_text);
  }

  const thresholdLines = ((thresholdsData as FrameworkThresholdRow[] | null) || [])
    .filter((t) => t.threshold_high || t.threshold_low)
    .map(
      (t) =>
        `- ${t.name}: valor alto = ${t.threshold_high || "sin dato"}; valor bajo = ${t.threshold_low || "sin dato"}`
    )
    .join("\n");

  let prompt = `Eres un asistente que ayuda a interpretar los resultados de una petición de feedback ágil en Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño). A diferencia de un 360, aquí no hay autoevaluación con la que comparar — son solo las valoraciones de quienes han respondido.

Datos de competencias mencionadas (escala 1-5):
${lines.join("\n")}
${
  thresholdLines
    ? `\nPara referencia (qué indica un valor alto o bajo en cada competencia — úsalo para calibrar el tono, no lo copies literalmente ni lo cites como lista):\n${thresholdLines}\n`
    : ""
}
Escribe una interpretación en español, en 2ª persona ("tú"), en 2-3 párrafos cortos:
1. Qué destaca (1-2 competencias con nota más alta o más mencionadas).
2. Qué competencia tiene más recorrido según la media, sin alarmismo, como oportunidad de desarrollo.
3. Si hay algo llamativo por lo dispares que son las notas entre quienes respondieron en alguna competencia, coméntalo como pregunta reflexiva.`;

  if (openByPrompt.size > 0) {
    const openLines = Array.from(openByPrompt.entries())
      .map(([q, answers]) => `Pregunta: "${q}"\n${answers.map((a) => `- ${a}`).join("\n")}`)
      .join("\n\n");
    prompt += `

Comentarios de texto libre que te han escrito (anonimizados, sin indicar quién escribió cada uno):
${openLines}

Cuando termines lo anterior, si en esos comentarios hay como máximo 1-2 temas que se repitan en varios comentarios de personas distintas (nunca a partir de un solo comentario aislado), añade en una línea aparte exactamente el texto "${RESPUESTAS_ABIERTAS_MARKER}" y, a continuación, un párrafo corto con ese resumen. No cites ningún comentario literalmente. Dilo explícitamente como una síntesis de las respuestas abiertas (por ejemplo, "en las respuestas abiertas se repite..."). Esta parte va aparte, no la mezcles con la anterior. Si no hay ningún tema que se repita, no escribas ni el marcador ni esta parte.`;
  }

  prompt += `

Tono humanista, cercano, nunca de evaluación de desempeño. No uses listas ni encabezados, solo párrafos de texto corrido separados por una línea en blanco.`;

  try {
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

    const data = await res.json();
    const text = (data?.content?.[0]?.text as string | undefined)?.trim();
    if (!text) return null;

    let resumen = text;
    let resumenAbiertas: string | null = null;

    if (resumen.includes(RESPUESTAS_ABIERTAS_MARKER)) {
      const [before, after] = resumen.split(RESPUESTAS_ABIERTAS_MARKER);
      resumen = before.trim();
      resumenAbiertas = after.trim() || null;
    }

    return { resumen, resumenAbiertas };
  } catch (e) {
    console.error("No se pudo generar la interpretación IA del feedback ágil:", e);
    return null;
  }
}

type GroupCompetencyRow = {
  competency_code: string;
  competency_name: string;
  role_name: string | null;
  peer_avg_value: number | null;
  self_avg_value: number | null;
  member_count: number;
};

export type ReportGroupInterpretationResult = {
  competencias: string;
  resumenAbiertas: string | null;
};

// Interpretación del informe de grupo (spec.md sección 17, "Informes de
// grupo" — fase 1) — se llama una única vez, al cerrar el grupo
// (closeReportGroup, src/app/actions/reportGroups.ts). Mismo criterio
// que el perfil individual: si falla o no hay clave, devuelve null sin
// reintento automático.
//
// Las respuestas abiertas se pasan EN BRUTO (todos los comentarios de
// todos los miembros, sin resumir antes) y no el resumen ya generado
// para cada 360 individual (ai_open_answers_text) — un patrón real de
// grupo puede estar formado por comentarios que, dentro del 360 de cada
// persona por separado, nunca llegaron a repetirse lo suficiente como
// para entrar en su propio resumen individual. Resumir primero por
// persona escondería justo el tipo de patrón que este informe busca.
export async function generateReportGroupInterpretation(
  supabase: SupabaseClient,
  groupId: string
): Promise<ReportGroupInterpretationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const [{ data }, { data: openAnswersData }] = await Promise.all([
    supabase.rpc("get_report_group_competency_summary", { p_group_id: groupId }),
    supabase.rpc("get_report_group_open_answers", { p_group_id: groupId }),
  ]);
  const rows = (data as GroupCompetencyRow[] | null) || [];
  if (rows.length === 0) return null;

  const lines = rows.map(
    (row) =>
      `- ${row.competency_name} (${row.role_name || "Plenitud"}): media de evaluadores ${row.peer_avg_value ?? "sin dato"}, media de autopercepción ${row.self_avg_value ?? "sin dato"}, ${row.member_count} personas con dato`
  );

  let prompt = `Eres un asistente que ayuda a interpretar el perfil agregado de un grupo dentro de Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño). Cada competencia trae dos medias del grupo (escala 1-5), calculadas a partir del último 360 cerrado de cada miembro: la media de cómo les evalúan sus compañeros, y la media de cómo se autoevalúan ellos mismos — cada persona pesa igual, sin importar cuántos evaluadores tuvo.

Datos del grupo:
${lines.join("\n")}

Escribe una interpretación en español, en 2ª persona plural ("vuestro equipo", "como grupo"), en 2-3 párrafos cortos:
1. Qué competencias están más desarrolladas en el grupo según sus compañeros (2-3 con nota más alta).
2. Qué competencias tienen más recorrido en el grupo (2-3 con nota más baja) — sin alarmismo, en tono de oportunidad de desarrollo colectivo.
3. Si hay una competencia donde la autopercepción del grupo se aleja notablemente de cómo les ve el resto (en cualquier sentido), coméntala como pregunta reflexiva, nunca como veredicto.`;

  const openComments = ((openAnswersData as { answer_text: string }[] | null) || [])
    .map((r) => r.answer_text)
    .filter(Boolean);

  if (openComments.length > 0) {
    prompt += `

Comentarios de texto libre recibidos por los miembros del grupo (anonimizados, sin indicar quién los escribió ni sobre quién es cada uno):
${openComments.map((c) => `- ${c}`).join("\n")}

Cuando termines la interpretación de competencias, busca patrones que se repitan en comentarios de al menos dos personas distintas del grupo (nunca a partir de un comentario aislado). Si encuentras alguno, añade en una línea aparte exactamente el texto "${RESPUESTAS_ABIERTAS_MARKER}" y, a continuación, hasta 3 párrafos cortos, cada uno empezando con su etiqueta en **negrita**, solo si aplica:
- **Reconocimiento:** un comportamiento que varias personas mencionan como algo que funciona y aporta valor al equipo.
- **Desafío:** una dificultad o fricción que se repite en varias personas.
- **Consejo:** una sugerencia o "píldora" práctica que se repite o que se desprende claramente de varios comentarios.

Escribe cada uno en 2ª persona plural ("en vuestro equipo..."). Omite cualquiera de los tres si no hay un patrón real que lo sostenga — no fuerces ninguna categoría. No cites ningún comentario literalmente ni digas a quién se refería. Si no hay ningún patrón en ninguna categoría, no escribas ni el marcador ni nada de esta parte.`;
  }

  prompt += `

Tono humanista, cercano, nunca de evaluación de desempeño ni de ranking entre personas — es un perfil de grupo, no de individuos. No uses listas ni encabezados, solo párrafos de texto corrido separados por una línea en blanco.`;

  try {
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

    const responseData = await res.json();
    const text = (responseData?.content?.[0]?.text as string | undefined)?.trim();
    if (!text) return null;

    let competencias = text;
    let resumenAbiertas: string | null = null;

    if (competencias.includes(RESPUESTAS_ABIERTAS_MARKER)) {
      const [before, after] = competencias.split(RESPUESTAS_ABIERTAS_MARKER);
      competencias = before.trim();
      resumenAbiertas = after.trim() || null;
    }

    return { competencias, resumenAbiertas };
  } catch (e) {
    console.error("No se pudo generar la interpretación IA del grupo:", e);
    return null;
  }
}
