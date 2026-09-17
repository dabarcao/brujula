import Link from "next/link";
import { redirect } from "next/navigation";
import CompetencyRadar from "@/components/CompetencyRadar";
import { buildCompetencyAxes, type FrameworkRow } from "@/lib/competencyAxes";
import { getCurrentUser } from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import Card from "@/components/ui/Card";
import AggregateBadge from "@/components/ui/AggregateBadge";
import PermissionDenied from "@/components/ui/PermissionDenied";

// membersManager.getOrganizationCompetencySummary()'s and
// membersManager.listCompetencyFrameworks()'s camelCase rows are mapped
// back to this file's own snake_case `SummaryRow`/`FrameworkRow` shapes so
// all downstream code (lines below, and the shared buildCompetencyAxes
// helper) stays untouched. On throw, falls back to the empty-array state
// (never crashes the render).

type SummaryRow = {
  competency_code: string;
  avg_value: number;
};

export default async function InformeEmpresaPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const member = await membersManager.getCurrentMember();

  // No hay nada que mostrar sin cuenta asociada -- sigue siendo un
  // redirect. Pero "member existe y no es supervisor" pasa a mostrar el
  // mismo permission-denied que ya usa Story 4.1 (dashboard/members), en
  // vez de un redirect silencioso (epics.md Story 4.5 AC).
  if (!member) {
    redirect("/dashboard");
  }

  if (!member.isSupervisor) {
    return (
      <PermissionDenied message="Esta vista es solo para supervisores de tu organización." />
    );
  }

  const orgName = member.organization?.name;

  // Conteo de personas que componen la vista agregada (AggregateBadge,
  // "Vista agregada — N personas") -- va por
  // membersManager.countActiveOrganizationMembers, solo el recuento de
  // miembros activos de la propia empresa.
  //
  // Ojo: esto cuenta TODOS los miembros activos de la organización, no
  // específicamente a quienes su feedback ya cruzó el umbral de revelado y
  // está representado en el radar de abajo -- get_organization_competency_
  // summary() (su propio CTE eligible_requests, supabase/migrations/
  // 0054_expose_role_in_competency_reports.sql:107-117) filtra por
  // feedback_response_count(fr.id) >= min_responses_to_reveal y nunca
  // expone qué miembros concretos están representados (anonimato/umbral
  // deliberados de esa RPC, no un descuido). Calcular el conteo exacto
  // exigiría superficie de backend nueva, fuera de alcance de esta historia
  // (solo UI) -- este conteo de toda la empresa es la mejor aproximación
  // honesta disponible sin tocar `src/server/managers/**`/`src/server/db/**`/
  // `src/app/api/**`.
  let activeMemberCount: number | null = null;
  try {
    activeMemberCount = await membersManager.countActiveOrganizationMembers(member.organizationId);
  } catch {
    activeMemberCount = null;
  }

  let summaryData: unknown;

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
    const rows = await membersManager.getOrganizationCompetencySummary();
    summaryData = rows.map((r) => ({
      competency_code: r.competencyCode,
      avg_value: r.avgValue,
    }));
  } catch {
    summaryData = [];
  }

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
    <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Mapa de competencias de {orgName}</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      {!hasAnyData ? (
        <Card>
          <p className="text-sm text-ink-soft">
            Todavía no hay suficiente feedback revelado en la empresa como
            para mostrar este mapa.
          </p>
        </Card>
      ) : (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-medium text-ink-soft">Mapa de competencias</h2>
            {activeMemberCount != null && (
              <AggregateBadge className="px-3 py-1">
                Vista agregada — {activeMemberCount}{" "}
                {activeMemberCount === 1 ? "persona" : "personas"}
              </AggregateBadge>
            )}
          </div>
          <Card>
            <p className="text-sm text-ink-soft mb-6">
              Junta todo el feedback ya revelado de todos los empleados (ágil
              y de ciclos 360), sin contar autoevaluaciones.
            </p>

            <div className="flex justify-center">
              <CompetencyRadar axes={radarAxes} />
            </div>
          </Card>
        </section>
      )}
    </main>
  );
}
