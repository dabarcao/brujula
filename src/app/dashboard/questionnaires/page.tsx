import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveOrgAdHocTemplate, saveOrg360Extra } from "@/app/actions/questionnaires";

const MAX_QUESTIONS = 5;

const SUBTYPE_LABELS: Record<string, string> = {
  meeting: "Reunión / presentación",
  collaboration: "Colaboración",
  leadership_initiative: "Liderazgo de una iniciativa",
  general: "General / desarrollo profesional",
};

type QuestionRow = { prompt: string; required: boolean };

async function loadQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  subtype: string
): Promise<{ own: QuestionRow[]; placeholder: QuestionRow[] }> {
  const { data: ownTemplate } = await supabase
    .from("survey_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("subtype", subtype)
    .maybeSingle();

  if (ownTemplate) {
    const { data: questions } = await supabase
      .from("survey_questions")
      .select("prompt, required")
      .eq("template_id", ownTemplate.id)
      .order("position");
    return { own: (questions as QuestionRow[] | null) || [], placeholder: [] };
  }

  const { data: platformTemplate } = await supabase
    .from("survey_templates")
    .select("id")
    .is("organization_id", null)
    .eq("subtype", subtype)
    .maybeSingle();

  if (!platformTemplate) return { own: [], placeholder: [] };

  const { data: questions } = await supabase
    .from("survey_questions")
    .select("prompt, required")
    .eq("template_id", platformTemplate.id)
    .order("position");

  return { own: [], placeholder: (questions as QuestionRow[] | null) || [] };
}

function QuestionInputs({
  prefix,
  existing,
  placeholder,
}: {
  prefix: string;
  existing: QuestionRow[];
  placeholder: QuestionRow[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            name={`${prefix}_prompt_${i}`}
            defaultValue={existing[i]?.prompt || ""}
            placeholder={placeholder[i]?.prompt || `Pregunta ${i + 1} (opcional)`}
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              name={`${prefix}_required_${i}`}
              defaultChecked={existing[i]?.required ?? true}
            />
            obligatoria
          </label>
        </div>
      ))}
    </div>
  );
}

export default async function QuestionnairesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("role, organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!currentMember || currentMember.role !== "org_admin") {
    redirect("/dashboard");
  }

  const subtypes = Object.keys(SUBTYPE_LABELS);
  const adHocQuestions = await Promise.all(
    subtypes.map((subtype) => loadQuestions(supabase, currentMember.organization_id, subtype))
  );

  const { data: extraTemplate } = await supabase
    .from("survey_templates")
    .select("id")
    .eq("organization_id", currentMember.organization_id)
    .eq("subtype", "360_extra")
    .maybeSingle();

  let extraQuestions: QuestionRow[] = [];
  if (extraTemplate) {
    const { data } = await supabase
      .from("survey_questions")
      .select("prompt, required")
      .eq("template_id", extraTemplate.id)
      .order("position");
    extraQuestions = (data as QuestionRow[] | null) || [];
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Cuestionarios</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Personaliza las preguntas de tu empresa. En el flujo ágil, tu propio
        cuestionario sustituye por completo al de la plataforma para ese
        tipo de solicitud. En el ciclo 360, tus preguntas se añaden después
        de las de la plataforma, no las sustituyen. Deja todas las
        preguntas vacías para volver a usar la versión por defecto.
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}
      {saved && (
        <p className="mb-6 rounded bg-green-50 text-green-700 text-sm p-3">
          Cambios guardados.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {subtypes.map((subtype, i) => (
          <section key={subtype} className="border rounded p-4">
            <p className="text-sm font-medium mb-3">
              Flujo ágil — {SUBTYPE_LABELS[subtype]}
            </p>
            <form action={saveOrgAdHocTemplate} className="flex flex-col gap-3">
              <input type="hidden" name="subtype" value={subtype} />
              <input
                type="text"
                name="name"
                placeholder="Nombre del cuestionario (opcional)"
                className="border rounded px-3 py-2 text-sm"
              />
              <QuestionInputs
                prefix="q"
                existing={adHocQuestions[i].own}
                placeholder={adHocQuestions[i].placeholder}
              />
              <button
                type="submit"
                className="border rounded px-4 py-2 text-sm hover:bg-gray-50 self-start"
              >
                Guardar
              </button>
            </form>
          </section>
        ))}

        <section className="border rounded p-4">
          <p className="text-sm font-medium mb-3">Ciclo 360 — sección propia</p>
          <p className="text-xs text-gray-500 mb-3">
            Estas preguntas se añaden después de las 24 preguntas por
            defecto de la plataforma en cada ciclo 360 nuevo que crees.
          </p>
          <form action={saveOrg360Extra} className="flex flex-col gap-3">
            <QuestionInputs prefix="extra" existing={extraQuestions} placeholder={[]} />
            <button
              type="submit"
              className="border rounded px-4 py-2 text-sm hover:bg-gray-50 self-start"
            >
              Guardar
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
