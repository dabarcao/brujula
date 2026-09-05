import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompetencyRadar from "@/components/CompetencyRadar";

type SummaryRow = {
  competency_code: string;
  competency_name: string;
  principle_code: string | null;
  principle_name: string | null;
  avg_value: number;
  response_count: number;
};

type FrameworkRow = {
  code: string;
  name: string;
  principle_id: string | null;
  competency_principles: { code: string; name: string; position: number } | null;
};

export default async function MiMapaDeCompetenciasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member) {
    redirect("/dashboard");
  }

  const [{ data: frameworkData }, { data: summaryData }] = await Promise.all([
    supabase
      .from("competency_frameworks")
      .select("code, name, principle_id, competency_principles(code, name, position)")
      .order("name"),
    supabase.rpc("get_my_competency_summary"),
  ]);

  const frameworks = (frameworkData as unknown as FrameworkRow[] | null) || [];
  const summaryByCode = new Map(
    ((summaryData as SummaryRow[] | null) || []).map((row) => [row.competency_code, row])
  );

  const axes = frameworks
    .map((framework) => {
      const principle = framework.competency_principles;
      const summary = summaryByCode.get(framework.code);
      return {
        code: framework.code,
        name: framework.name,
        principleCode: principle?.code || "",
        principlePosition: principle?.position ?? 99,
        principleName: principle?.name || "",
        avgValue: summary?.avg_value ?? null,
      };
    })
    .sort((a, b) => a.principlePosition - b.principlePosition || a.name.localeCompare(b.name));

  const hasAnyData = axes.some((axis) => axis.avgValue != null);

  const principleAverages = new Map<string, { name: string; values: number[] }>();
  for (const axis of axes) {
    if (axis.avgValue == null || !axis.principleCode) continue;
    if (!principleAverages.has(axis.principleCode)) {
      principleAverages.set(axis.principleCode, { name: axis.principleName, values: [] });
    }
    principleAverages.get(axis.principleCode)!.values.push(axis.avgValue);
  }

  const dimensionCards = Array.from(principleAverages.entries()).map(([code, { name, values }]) => ({
    code,
    name,
    average: values.reduce((sum, v) => sum + v, 0) / values.length,
  }));

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Mi mapa de competencias</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      {!hasAnyData ? (
        <p className="text-sm text-gray-600">
          Todavía no hay suficiente feedback tuyo revelado como para mostrar tu
          mapa. En cuanto se abra alguna de tus solicitudes o ciclos (al
          menos 3 respuestas), aparecerá aquí.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-6">
            Junta todo el feedback que has recibido (ágil y de ciclos 360) que
            ya se ha revelado, sin contar tu autoevaluación.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-8">
            {dimensionCards.map((card) => (
              <div key={card.code} className="border rounded p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">{card.name}</p>
                <p className="text-2xl font-semibold">{card.average.toFixed(1)}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <CompetencyRadar axes={axes} />
          </div>
        </>
      )}
    </main>
  );
}
