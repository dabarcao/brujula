import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompetencyRadar, { GROUP_COLORS } from "@/components/CompetencyRadar";
import { buildCompetencyAxes, type FrameworkRow } from "@/lib/competencyAxes";

type MapRow = {
  competency_code: string;
  base_value: number | null;
  mention_delta: number;
  last_cycle_closed_at: string;
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

  const [{ data: frameworkData }, { data: mapData }] = await Promise.all([
    supabase
      .from("competency_frameworks")
      .select(
        "code, name, principle_id, role_id, competency_principles(code, name, position), competency_roles(code, name, position)"
      )
      .order("name"),
    supabase.rpc("get_my_competency_map"),
  ]);

  const frameworks = (frameworkData as unknown as FrameworkRow[] | null) || [];
  const mapRows = (mapData as MapRow[] | null) || [];
  const hasClosedCycle = mapRows.length > 0;

  const baseByCode = new Map(
    mapRows
      .filter((row): row is MapRow & { base_value: number } => row.base_value != null)
      .map((row) => [row.competency_code, row.base_value])
  );
  const deltaByCode = new Map(mapRows.map((row) => [row.competency_code, row.mention_delta]));
  const lastClosedAt = mapRows[0]?.last_cycle_closed_at ?? null;

  const axes = buildCompetencyAxes(frameworks, baseByCode);
  const radarAxes = axes.map((a) => ({
    code: a.code,
    name: a.name,
    groupCode: a.roleCode || "plenitud",
    avgValue: a.avgValue,
    mentionDelta: deltaByCode.get(a.code) ?? 0,
  }));

  const highlighted = radarAxes
    .filter((a) => a.mentionDelta > 0)
    .sort((a, b) => b.mentionDelta - a.mentionDelta);
  const challenged = radarAxes
    .filter((a) => a.mentionDelta < 0)
    .sort((a, b) => a.mentionDelta - b.mentionDelta);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Mi mapa de competencias</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      {!hasClosedCycle ? (
        <p className="text-sm text-gray-600">
          Tu mapa se basa en tu último ciclo 360 ya finalizado — todavía no
          tienes ninguno. En cuanto finalices tu primer 360 (sección
          &ldquo;Pedir feedback 360&rdquo;), aparecerá aquí.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-6">
            La nota de cada competencia es la de tu último 360 finalizado
            ({lastClosedAt}). Las &ldquo;menciones&rdquo; son aparte: cuentan cuántas
            veces te han destacado (+1) o señalado como desafío (-1) en
            feedback ágil desde entonces — vuelven a cero en cuanto finalices
            tu próximo 360.
          </p>

          <div className="flex justify-center">
            <CompetencyRadar axes={radarAxes} />
          </div>

          {(highlighted.length > 0 || challenged.length > 0) && (
            <div className="grid grid-cols-2 gap-6 mt-8">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Te destacan en</p>
                {highlighted.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin menciones nuevas.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {highlighted.map((a) => (
                      <li key={a.code} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: GROUP_COLORS[a.groupCode] || "#6b7280" }}
                        />
                        <span className="flex-1">{a.name}</span>
                        <span className="text-green-600 font-medium tabular-nums">
                          +{a.mentionDelta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Te señalan como desafío</p>
                {challenged.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin menciones nuevas.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {challenged.map((a) => (
                      <li key={a.code} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: GROUP_COLORS[a.groupCode] || "#6b7280" }}
                        />
                        <span className="flex-1">{a.name}</span>
                        <span className="text-red-600 font-medium tabular-nums">
                          {a.mentionDelta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
