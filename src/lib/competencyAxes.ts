// Compartido entre "Mi mapa de competencias" (un empleado) y el informe
// agregado de empresa (todos los empleados, solo Supervisor): junta la
// lista completa de 15 competencias (modelo VACC, ver
// 0053_vacc_competency_model.sql) con lo que devuelva la RPC de turno,
// para que salgan siempre los 15 ejes aunque a alguno le falten datos.

export type FrameworkRow = {
  code: string;
  name: string;
  principle_id: string | null;
  role_id: string | null;
  competency_principles: { code: string; name: string; position: number } | null;
  competency_roles: { code: string; name: string; position: number } | null;
};

export type CompetencyAxis = {
  code: string;
  name: string;
  principleCode: string;
  principleName: string;
  // Vacío para las competencias de Plenitud — no viven dentro de ningún
  // rol (docs/modelo_roles_vacc.md). rolePosition usa 99 como centinela
  // para que, si algo queda sin rol por error, se ordene al final en vez
  // de mezclarse con el resto.
  roleCode: string;
  rolePosition: number;
  roleName: string;
  avgValue: number | null;
};

export function buildCompetencyAxes(
  frameworks: FrameworkRow[],
  avgByCode: Map<string, number>
): CompetencyAxis[] {
  return frameworks
    .map((framework) => {
      const principle = framework.competency_principles;
      const role = framework.competency_roles;
      return {
        code: framework.code,
        name: framework.name,
        principleCode: principle?.code || "",
        principleName: principle?.name || "",
        roleCode: role?.code || "",
        rolePosition: role?.position ?? 99,
        roleName: role?.name || "",
        avgValue: avgByCode.get(framework.code) ?? null,
      };
    })
    .sort((a, b) => a.rolePosition - b.rolePosition || a.name.localeCompare(b.name));
}

// Plenitud no vive dentro de ningún rol VACC — se dibuja como un
// mini-radar aparte, no mezclada en el mismo círculo (sección 9 del
// spec, "Opción A" acordada para el mapa de competencias).
export function splitVaccAndPlenitud(axes: CompetencyAxis[]) {
  return {
    vacc: axes.filter((axis) => axis.roleCode),
    plenitud: axes.filter((axis) => !axis.roleCode),
  };
}

export function computeGroupAverages(axes: CompetencyAxis[]) {
  const byGroup = new Map<string, { name: string; position: number; values: number[] }>();
  for (const axis of axes) {
    if (axis.avgValue == null) continue;
    const key = axis.roleCode || "plenitud";
    const name = axis.roleCode ? axis.roleName : "Plenitud";
    const position = axis.roleCode ? axis.rolePosition : 5;
    if (!byGroup.has(key)) {
      byGroup.set(key, { name, position, values: [] });
    }
    byGroup.get(key)!.values.push(axis.avgValue);
  }
  return Array.from(byGroup.entries())
    .map(([code, { name, position, values }]) => ({
      code,
      name,
      position,
      average: values.reduce((sum, v) => sum + v, 0) / values.length,
    }))
    .sort((a, b) => a.position - b.position);
}
