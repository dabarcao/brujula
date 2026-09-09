import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompetencyRadar from "@/components/CompetencyRadar";
import { buildCompetencyAxes, type FrameworkRow } from "@/lib/competencyAxes";

type SummaryRow = {
  competency_code: string;
  avg_value: number;
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
      .select(
        "code, name, principle_id, role_id, competency_principles(code, name, position), competency_roles(code, name, position)"
      )
      .order("name"),
    supabase.rpc("get_my_competency_summary"),
  ]);

  const frameworks = (frameworkData as unknown as FrameworkRow[] | null) || [];
  const avgByCode = new Map(
    ((summaryData as SummaryRow[] | null) || []).map((row) => [row.competency_code, row.avg_value])
  );

  const axes = buildCompetencyAxes(frameworks, avgByCode);
  const hasAnyData = axes.some((axis) => axis.avgValue != null);
  const radarAxes = axes.map((a) => ({
    code: a.code,
    name: a.name,
    groupCode: a.roleCode || "plenitud",
    avgValue: a.avgValue,
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

          <div className="flex justify-center">
            <CompetencyRadar axes={radarAxes} />
          </div>
        </>
      )}
    </main>
  );
}
