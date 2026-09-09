// "Termómetro" horizontal, una barra por competencia — pensado para
// Plenitud (siempre 3 competencias, docs/modelo_roles_vacc.md): con tan
// pocos ejes, un radar (triángulo) aporta poco frente a leer tres barras
// directamente, y evita tener que encajar un círculo entero en un hueco
// pequeño. Server Component — no hay interactividad, los grupos de
// evaluador se muestran todos a la vez (con solo 3 filas no hace falta
// un chip para elegir cuáles ver, a diferencia del radar de 12 ejes).

import {
  EVALUATOR_CATEGORY_LABELS,
  EVALUATOR_CATEGORY_COLORS as CATEGORY_COLORS,
} from "@/lib/evaluatorCategories";

type Axis = {
  code: string;
  name: string;
  // Media de peers (llamado "avgValue" en el mapa agregado, "peerAvgValue"
  // en el comparativo del 360 — aquí un solo nombre para las dos).
  avgValue: number | null;
  selfValue?: number | null;
};

type CategorySeries = {
  category: string;
  valuesByCode: Record<string, number>;
};

const BAR_COLOR = "#dc2626";

export default function CompetencyBars({
  axes,
  categorySeries = [],
  caption,
  order = 0,
}: {
  axes: Axis[];
  categorySeries?: CategorySeries[];
  caption?: string;
  // Para convivir con CompetencyComparisonChart (VACC) en el mismo
  // contenedor flex: su gráfico va en order=0, su tabla en order+100 —
  // esto se coloca entre medias, justo al lado del gráfico VACC.
  order?: number;
}) {
  const hasAnySelf = axes.some((axis) => axis.selfValue != null);
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / 5) * 100))}%`;

  return (
    <div className="w-full" style={{ maxWidth: 320, order }}>
      {caption && <p className="text-xs text-gray-500 mb-3 text-center">{caption}</p>}
      <div className="flex flex-col gap-4">
        {axes.map((axis) => (
          <div key={axis.code}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-gray-700">{axis.name}</span>
              <span className="text-gray-500">
                {axis.avgValue != null ? axis.avgValue.toFixed(1) : "—"}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-gray-100">
              {axis.avgValue != null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: pct(axis.avgValue), backgroundColor: BAR_COLOR }}
                />
              )}
              {axis.selfValue != null && (
                <div
                  className="absolute -top-1 w-0.5 h-4 bg-gray-900 rounded-full"
                  style={{ left: pct(axis.selfValue) }}
                />
              )}
              {categorySeries.map((series) => {
                const value = series.valuesByCode[axis.code];
                if (value == null) return null;
                return (
                  <div
                    key={series.category}
                    className="absolute top-1/2 w-2 h-2 rounded-full border border-white"
                    style={{
                      left: pct(value),
                      transform: "translate(-50%, -50%)",
                      backgroundColor: CATEGORY_COLORS[series.category] || "#6b7280",
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-4">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: BAR_COLOR }}
          />
          Media
        </span>
        {hasAnySelf && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0.5 h-3 bg-gray-900" /> Tú
          </span>
        )}
        {categorySeries.map((series) => (
          <span key={series.category} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[series.category] || "#6b7280" }}
            />
            {EVALUATOR_CATEGORY_LABELS[series.category] || series.category}
          </span>
        ))}
      </div>
    </div>
  );
}
