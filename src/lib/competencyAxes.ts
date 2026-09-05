// Compartido entre "Mi mapa de competencias" (un empleado) y el informe
// agregado de empresa (todos los empleados, solo Supervisor): junta la
// lista completa de 14 competencias con lo que devuelva la RPC de turno,
// para que salgan siempre los 14 ejes aunque a alguno le falten datos.

export type FrameworkRow = {
  code: string;
  name: string;
  principle_id: string | null;
  competency_principles: { code: string; name: string; position: number } | null;
};

export type CompetencyAxis = {
  code: string;
  name: string;
  principleCode: string;
  principlePosition: number;
  principleName: string;
  avgValue: number | null;
};

export function buildCompetencyAxes(
  frameworks: FrameworkRow[],
  avgByCode: Map<string, number>
): CompetencyAxis[] {
  return frameworks
    .map((framework) => {
      const principle = framework.competency_principles;
      return {
        code: framework.code,
        name: framework.name,
        principleCode: principle?.code || "",
        principlePosition: principle?.position ?? 99,
        principleName: principle?.name || "",
        avgValue: avgByCode.get(framework.code) ?? null,
      };
    })
    .sort((a, b) => a.principlePosition - b.principlePosition || a.name.localeCompare(b.name));
}

export function computeDimensionAverages(axes: CompetencyAxis[]) {
  const byPrinciple = new Map<string, { name: string; values: number[] }>();
  for (const axis of axes) {
    if (axis.avgValue == null || !axis.principleCode) continue;
    if (!byPrinciple.has(axis.principleCode)) {
      byPrinciple.set(axis.principleCode, { name: axis.principleName, values: [] });
    }
    byPrinciple.get(axis.principleCode)!.values.push(axis.avgValue);
  }
  return Array.from(byPrinciple.entries()).map(([code, { name, values }]) => ({
    code,
    name,
    average: values.reduce((sum, v) => sum + v, 0) / values.length,
  }));
}
