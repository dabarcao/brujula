"use client";

import { useState } from "react";
import { PRINCIPLE_COLORS, PRINCIPLE_LABELS, PRINCIPLE_ORDER } from "@/components/CompetencyRadar";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";

type Axis = {
  code: string;
  name: string;
  principleCode: string;
  selfValue: number | null;
  peerAvgValue: number | null;
};

type CategorySeries = {
  category: string;
  valuesByCode: Record<string, number>;
};

const CATEGORY_COLORS: Record<string, string> = {
  manager: "#7c3aed",
  team: "#0891b2",
  organization: "#ca8a04",
  other: "#db2777",
};

export default function CompetencyComparisonChart({
  axes: rawAxes,
  categorySeries,
}: {
  axes: Axis[];
  categorySeries: CategorySeries[];
}) {
  // Igual que en CompetencyRadar: los ejes siempre se agrupan por
  // dimensión antes de dibujarlos, sin importar en qué orden lleguen de
  // la consulta (get_request_competency_comparison ordena por nombre de
  // competencia, no por dimensión) — si no, los colores de las 3
  // dimensiones salen intercalados en vez de en 3 bloques contiguos.
  const axes = [...rawAxes].sort(
    (a, b) => (PRINCIPLE_ORDER[a.principleCode] ?? 99) - (PRINCIPLE_ORDER[b.principleCode] ?? 99)
  );
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const size = 440;
  const center = size / 2;
  const maxRadius = center - 90;
  const n = axes.length;
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const halfWidth = Math.PI / n;

  const points = axes.map((axis, i) => {
    const angle = angleFor(i);
    const color = PRINCIPLE_COLORS[axis.principleCode] || "#6b7280";
    return {
      ...axis,
      color,
      axisX: center + Math.cos(angle) * maxRadius,
      axisY: center + Math.sin(angle) * maxRadius,
      labelX: center + Math.cos(angle) * (maxRadius + 16),
      labelY: center + Math.sin(angle) * (maxRadius + 16),
    };
  });

  const wedges = axes
    .map((axis, i) => {
      if (axis.peerAvgValue == null) return null;
      const angle = angleFor(i);
      const r = maxRadius * (axis.peerAvgValue / 5);
      const a1 = angle - halfWidth;
      const a2 = angle + halfWidth;
      const p1x = center + Math.cos(a1) * r;
      const p1y = center + Math.sin(a1) * r;
      const p2x = center + Math.cos(a2) * r;
      const p2y = center + Math.sin(a2) * r;
      const color = PRINCIPLE_COLORS[axis.principleCode] || "#6b7280";
      return {
        code: axis.code,
        color,
        d: `M ${center} ${center} L ${p1x} ${p1y} A ${r} ${r} 0 0 1 ${p2x} ${p2y} Z`,
      };
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  const selfPoints = axes.map((axis, i) => {
    const angle = angleFor(i);
    const hasValue = axis.selfValue != null;
    const r = hasValue ? maxRadius * ((axis.selfValue as number) / 5) : null;
    return {
      code: axis.code,
      x: r != null ? center + Math.cos(angle) * r : null,
      y: r != null ? center + Math.sin(angle) * r : null,
    };
  });
  const hasAnySelf = axes.some((axis) => axis.selfValue != null);
  const selfSegments: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = selfPoints[i];
    const b = selfPoints[(i + 1) % n];
    if (a.x != null && a.y != null && b.x != null && b.y != null) {
      selfSegments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }

  const seriesByCategory = new Map(categorySeries.map((s) => [s.category, s.valuesByCode]));

  // Escala de referencia (1-5) dibujada en el hueco entre el último eje y
  // el primero, para no solaparse con ningún radio ni etiqueta de
  // competencia — así se puede leer a ojo qué anillo corresponde a qué
  // nota, sin tener que adivinarlo.
  const scaleAngle = -Math.PI / 2 - halfWidth;
  const scaleTicks = [1, 2, 3, 4, 5].map((level) => {
    const r = maxRadius * (level / 5);
    return {
      level,
      x: center + Math.cos(scaleAngle) * r,
      y: center + Math.sin(scaleAngle) * r,
    };
  });

  // Tabla de valores exactos debajo del gráfico — el radio de cada punto
  // solo permite leer la nota a ojo, esto la deja sin ambigüedad. A
  // diferencia de las líneas del gráfico (que solo se dibujan si el chip
  // de esa categoría está activo), la tabla muestra siempre TODAS las
  // categorías que el backend ya considera reveladas — categorySeries
  // solo trae grupos con su mínimo cumplido (3, salvo "jefe" que basta
  // con 1, migración 0052), así que aquí no hace falta filtrar más.
  const tableColumns: { key: string; label: string; getValue: (axis: (typeof axes)[number]) => number | null }[] = [
    { key: "peer", label: "Media", getValue: (axis) => axis.peerAvgValue },
  ];
  if (hasAnySelf) {
    tableColumns.push({ key: "self", label: "Tú", getValue: (axis) => axis.selfValue });
  }
  for (const series of categorySeries) {
    tableColumns.push({
      key: series.category,
      label: EVALUATOR_CATEGORY_LABELS[series.category] || series.category,
      getValue: (axis) => seriesByCategory.get(series.category)?.[axis.code] ?? null,
    });
  }

  const toggleCategory = (category: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 480 }}>
        {[1, 2, 3, 4, 5].map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={maxRadius * (level / 5)}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        ))}
        {points.map((p) => (
          <line
            key={`axis-${p.code}`}
            x1={center}
            y1={center}
            x2={p.axisX}
            y2={p.axisY}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        ))}
        {wedges.map((w) => (
          <path key={`wedge-${w.code}`} d={w.d} fill={w.color} opacity={0.18} />
        ))}
        {categorySeries.map((series) =>
          activeCategories.has(series.category) ? (
            <CategoryLine
              key={series.category}
              axes={axes}
              valuesByCode={series.valuesByCode}
              color={CATEGORY_COLORS[series.category] || "#6b7280"}
              center={center}
              maxRadius={maxRadius}
              angleFor={angleFor}
            />
          ) : null
        )}
        {hasAnySelf &&
          selfSegments.map((d, i) => (
            <path key={`self-${i}`} d={d} fill="none" stroke="#111827" strokeWidth={2} />
          ))}
        {hasAnySelf &&
          selfPoints.map((p) =>
            p.x != null && p.y != null ? (
              <circle key={`selfdot-${p.code}`} cx={p.x} cy={p.y} r={3.5} fill="#111827" />
            ) : null
          )}
        {scaleTicks.map((tick) => (
          <text
            key={`scale-${tick.level}`}
            x={tick.x}
            y={tick.y}
            fontSize={8.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#9ca3af"
          >
            {tick.level}
          </text>
        ))}
        {points.map((p) => (
          <text
            key={`label-${p.code}`}
            x={p.labelX}
            y={p.labelY}
            fontSize={9.5}
            textAnchor={
              Math.abs(p.labelX - center) < 4 ? "middle" : p.labelX > center ? "start" : "end"
            }
            dominantBaseline="middle"
            fill={p.color}
          >
            {p.name}
          </text>
        ))}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mt-1">
        {Object.entries(PRINCIPLE_LABELS).map(([code, label]) => (
          <span key={code} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: PRINCIPLE_COLORS[code], opacity: 0.5 }}
            />
            {label} (media)
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-900" /> Tú
        </span>
      </div>

      {categorySeries.length > 0 && (
        <div className="mt-4 w-full">
          <p className="text-xs text-gray-500 mb-2">
            Ver también la media de un grupo concreto de evaluadores:
          </p>
          <div className="flex flex-wrap gap-2">
            {categorySeries.map((series) => {
              const active = activeCategories.has(series.category);
              const color = CATEGORY_COLORS[series.category] || "#6b7280";
              return (
                <button
                  key={series.category}
                  type="button"
                  onClick={() => toggleCategory(series.category)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
                  style={
                    active
                      ? { borderColor: color, color, backgroundColor: `${color}14` }
                      : { borderColor: "#d1d5db", color: "#6b7280" }
                  }
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {EVALUATOR_CATEGORY_LABELS[series.category] || series.category}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 w-full overflow-x-auto">
        <table className="w-full text-xs border rounded overflow-hidden">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Competencia</th>
              {tableColumns.map((col) => (
                <th key={col.key} className="px-3 py-2 font-medium text-right">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {axes.map((axis) => (
              <tr key={axis.code}>
                <td className="px-3 py-2">{axis.name}</td>
                {tableColumns.map((col) => {
                  const value = col.getValue(axis);
                  return (
                    <td key={col.key} className="px-3 py-2 text-right text-gray-700">
                      {value != null ? value.toFixed(1) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryLine({
  axes,
  valuesByCode,
  color,
  center,
  maxRadius,
  angleFor,
}: {
  axes: Axis[];
  valuesByCode: Record<string, number>;
  color: string;
  center: number;
  maxRadius: number;
  angleFor: (i: number) => number;
}) {
  const n = axes.length;
  const pts = axes.map((axis, i) => {
    const value = valuesByCode[axis.code];
    if (value == null) return { x: null, y: null };
    const angle = angleFor(i);
    const r = maxRadius * (value / 5);
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  });
  const segments: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.x != null && a.y != null && b.x != null && b.y != null) {
      segments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }
  return (
    <>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} />
      ))}
      {pts.map((p, i) =>
        p.x != null && p.y != null ? (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} />
        ) : null
      )}
    </>
  );
}
