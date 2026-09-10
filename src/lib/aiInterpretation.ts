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

export type AiInterpretationResult = {
  interpretation: string;
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

export async function generateAiInterpretation(
  supabase: SupabaseClient,
  requestId: string
): Promise<AiInterpretationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const [{ data: comparisonData }, { data: byCategoryData }, { data: saboteadoresData }] =
    await Promise.all([
      supabase.rpc("get_request_competency_comparison", { p_request_id: requestId }),
      supabase.rpc("get_request_competency_by_category", { p_request_id: requestId }),
      supabase.rpc("get_request_saboteadores", { p_request_id: requestId }),
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

  let prompt = `Eres un asistente que ayuda a interpretar el perfil de un informe de feedback 360 en Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño).

Datos de competencias (escala 1-5, "sin dato" cuando no aplica):
${lines.join("\n")}

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

Además, esta persona se autoevaluó alto en los siguientes saboteadores (patrones de pensamiento limitantes, en el sentido de Shirzad Chamine/Positive Intelligence — no son competencias, no los relaciones con ninguna de la lista de arriba de forma fija ni causal): ${saboteadorLines}. Estos datos de saboteadores son SOLO de autoevaluación — nadie más los puntúa, así que no hables de "cómo te ven" para ellos.

5. Añade un párrafo más, tejido con naturalidad en la misma interpretación (no como una sección aparte ni con un encabezado propio), sobre qué creencia o patrón puede haber detrás de cada saboteador alto — siempre en tono de hipótesis ("puede estar relacionado con...", "vale la pena explorar si..."), nunca de veredicto ("esto te está limitando"). Si algún gap o divergencia de los datos de competencias de arriba parece conectar con ese saboteador, puedes mencionarlo como refuerzo, pero no fuerces la conexión si no la hay.

Todo el texto debe leerse como UNA única interpretación conjunta del perfil (competencias y saboteadores entrelazados), nunca como dos bloques o informes separados.`;
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

    return { interpretation: text };
  } catch (e) {
    console.error("No se pudo generar la interpretación IA:", e);
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

// Interpretación del informe de grupo (spec.md sección 17, "Informes de
// grupo" — fase 1) — se llama una única vez, al cerrar el grupo
// (closeReportGroup, src/app/actions/reportGroups.ts). Mismo criterio
// que el perfil individual: si falla o no hay clave, devuelve null sin
// reintento automático.
export async function generateReportGroupInterpretation(
  supabase: SupabaseClient,
  groupId: string
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { data } = await supabase.rpc("get_report_group_competency_summary", {
    p_group_id: groupId,
  });
  const rows = (data as GroupCompetencyRow[] | null) || [];
  if (rows.length === 0) return null;

  const lines = rows.map(
    (row) =>
      `- ${row.competency_name} (${row.role_name || "Plenitud"}): media de evaluadores ${row.peer_avg_value ?? "sin dato"}, media de autopercepción ${row.self_avg_value ?? "sin dato"}, ${row.member_count} personas con dato`
  );

  const prompt = `Eres un asistente que ayuda a interpretar el perfil agregado de un grupo dentro de Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño). Cada competencia trae dos medias del grupo (escala 1-5), calculadas a partir del último 360 cerrado de cada miembro: la media de cómo les evalúan sus compañeros, y la media de cómo se autoevalúan ellos mismos — cada persona pesa igual, sin importar cuántos evaluadores tuvo.

Datos del grupo:
${lines.join("\n")}

Escribe una interpretación en español, en 2ª persona plural ("vuestro equipo", "como grupo"), en 2-3 párrafos cortos:
1. Qué competencias están más desarrolladas en el grupo según sus compañeros (2-3 con nota más alta).
2. Qué competencias tienen más recorrido en el grupo (2-3 con nota más baja) — sin alarmismo, en tono de oportunidad de desarrollo colectivo.
3. Si hay una competencia donde la autopercepción del grupo se aleja notablemente de cómo les ve el resto (en cualquier sentido), coméntala como pregunta reflexiva, nunca como veredicto.

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
