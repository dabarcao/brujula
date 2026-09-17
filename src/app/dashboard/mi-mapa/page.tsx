import Link from "next/link";
import { redirect } from "next/navigation";
import CompetencyRadar, { GROUP_COLORS } from "@/components/CompetencyRadar";
import { buildCompetencyAxes, type FrameworkRow } from "@/lib/competencyAxes";
import { getCurrentUser } from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import Card from "@/components/ui/Card";

// feedbackManager.getMyCompetencyMap()'s and
// membersManager.listCompetencyFrameworks()'s camelCase rows are mapped
// back to this file's own snake_case `MapRow`/`FrameworkRow` shapes so all
// downstream code (lines below, and the shared buildCompetencyAxes helper)
// stays untouched. On throw, falls back to the empty-array state (never
// crashes the render).

type MapRow = {
  competency_code: string;
  base_value: number | null;
  mention_delta: number;
  last_cycle_closed_at: string;
};

// Story 7.4 chokepoint check: an Invitado has no competency map of their
// own (never the subject of a company 360 cycle -- 0076_guest_member_type.
// sql's own create_feedback_cycle guard). dashboard/page.tsx hides the
// entry link for a guest (matching upstream commit 62e2ed8's own dashboard/
// page.tsx diff, which never added a guard here either); no redirect is
// added on this page itself because it degrades safely on direct
// navigation regardless -- an Invitado can never have a closed cycle, so
// `hasClosedCycle` below is always false and the existing "todavía no
// tienes ninguno" empty state renders, same as any other member who
// hasn't finished their first 360 yet. Verified, not left to inspection.

export default async function MiMapaDeCompetenciasPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const member = await membersManager.getCurrentMember();

  if (!member) {
    redirect("/dashboard");
  }

  let mapData: unknown;

  let frameworks: FrameworkRow[] = [];
  try {
    const rows = await membersManager.listCompetencyFrameworks();
    frameworks = rows.map((r) => ({
      code: r.code,
      name: r.name,
      principle_id: r.principleId,
      role_id: r.roleId,
      competency_principles: r.principle,
      competency_roles: r.role,
    }));
  } catch {
    frameworks = [];
  }

  try {
    const rows = await feedbackManager.getMyCompetencyMap();
    mapData = rows.map((r) => ({
      competency_code: r.competencyCode,
      base_value: r.baseValue,
      mention_delta: r.mentionDelta,
      last_cycle_closed_at: r.lastCycleClosedAt,
    }));
  } catch {
    mapData = [];
  }

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
    <main className="flex-1 p-8 max-w-xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Mi mapa de competencias</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      {!hasClosedCycle ? (
        // Mi mapa, first-time (EXPERIENCE.md State Patterns) -- distinct
        // from the per-request threshold-not-met state: there's no request
        // to wait on yet, just a first cycle that hasn't happened.
        <Card className="flex flex-col gap-2">
          <p className="text-body font-heading-sm text-ink">
            Tu mapa aparecerá aquí después de tu primer ciclo 360 cerrado
          </p>
          <p className="text-sm text-ink-soft">
            Tu mapa se basa en tu último ciclo 360 ya finalizado — todavía no
            tienes ninguno. En cuanto finalices tu primer 360 (sección
            &ldquo;Pedir feedback 360&rdquo;), aparecerá aquí.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-ink-soft mb-6">
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
                <p className="text-caption font-caption text-ink-soft mb-2">Te destacan en</p>
                {highlighted.length === 0 ? (
                  <p className="text-xs text-ink-soft">Sin menciones nuevas.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {highlighted.map((a) => (
                      <li key={a.code} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: GROUP_COLORS[a.groupCode] || "#6b7280" }}
                        />
                        <span className="flex-1 text-ink">{a.name}</span>
                        <span className="text-ink font-medium tabular-nums">
                          +{a.mentionDelta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-caption font-caption text-ink-soft mb-2">
                  Te señalan como desafío
                </p>
                {challenged.length === 0 ? (
                  <p className="text-xs text-ink-soft">Sin menciones nuevas.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {challenged.map((a) => (
                      <li key={a.code} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: GROUP_COLORS[a.groupCode] || "#6b7280" }}
                        />
                        <span className="flex-1 text-ink">{a.name}</span>
                        <span className="text-ink font-medium tabular-nums">
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
