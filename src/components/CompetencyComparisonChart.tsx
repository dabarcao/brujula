"use client";

import { Fragment, useState } from "react";
import { GROUP_COLORS, GROUP_LABELS, GROUP_ORDER } from "@/components/CompetencyRadar";
import {
  EVALUATOR_CATEGORY_LABELS,
  EVALUATOR_CATEGORY_COLORS as CATEGORY_COLORS,
} from "@/lib/evaluatorCategories";

type Axis = {
  code: string;
  name: string;
  // Rol VACC (visionario/arquitecto/catalizador/coach) o "plenitud" —
  // ver CompetencyRadar, mismo mecanismo de agrupación/color.
  groupCode: string;
  selfValue: number | null;
  peerAvgValue: number | null;
};

type CategorySeries = {
  category: string;
  valuesByCode: Record<string, number>;
};

export default function CompetencyComparisonChart({
  axes: rawAxes,
  categorySeries,
  size = 440,
}: {
  axes: Axis[];
  categorySeries: CategorySeries[];
  size?: number;
}) {
  // Igual que en CompetencyRadar: los ejes siempre se agrupan por rol
  // antes de dibujarlos, sin importar en qué orden lleguen de la
  // consulta (get_request_competency_comparison ordena por nombre de
  // competencia, no por rol) — si no, los colores de cada grupo salen
  // intercalados en vez de en bloques contiguos.
  const axes = [...rawAxes].sort(
    (a, b) => (GROUP_ORDER[a.groupCode] ?? 99) - (GROUP_ORDER[b.groupCode] ?? 99)
  );
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const n = axes.length;

  const groupsPresent = Array.from(new Set(axes.map((a) => a.groupCode))).sort(
    (a, b) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99)
  );
  const showQuadrants = groupsPresent.length > 1;

  const center = size / 2;
  const maxRadius = center - (showQuadrants ? 100 : 90);
  const halfWidth = Math.PI / n;

  // Centra el PRIMER grupo (Plenitud) arriba del todo — ver
  // CompetencyRadar para la explicación completa de esta fórmula.
  const firstGroupSize = axes.filter((a) => a.groupCode === axes[0]?.groupCode).length;
  const centerIndex = (firstGroupSize - 1) / 2;
  const angleFor = (i: number) => ((Math.PI * 2) / n) * (i - centerIndex) - Math.PI / 2;

  // Redondeado a 2 decimales: Math.cos/Math.sin pueden dar un último
  // dígito distinto entre el render de servidor y el del navegador —
  // con 15 decimales de precisión en el string del "d" del SVG, eso ya
  // basta para que React marque un desajuste de hidratación (ver
  // CompetencyRadar, mismo motivo).
  const round = (num: number) => Math.round(num * 100) / 100;

  const points = axes.map((axis, i) => {
    const angle = angleFor(i);
    const color = GROUP_COLORS[axis.groupCode] || "#6b7280";
    return {
      ...axis,
      color,
      axisX: round(center + Math.cos(angle) * maxRadius),
      axisY: round(center + Math.sin(angle) * maxRadius),
      labelX: round(center + Math.cos(angle) * (maxRadius + 16)),
      labelY: round(center + Math.sin(angle) * (maxRadius + 16)),
    };
  });

  // Un gajo de fondo por rol, igual que en CompetencyRadar — deja claro
  // a qué sector pertenece cada competencia sin leer la leyenda.
  const quadrants: { code: string; d: string; labelX: number; labelY: number }[] = [];
  if (showQuadrants) {
    let runStart = 0;
    for (let i = 1; i <= n; i++) {
      const code = axes[i % n]?.groupCode;
      if (i === n || code !== axes[runStart].groupCode) {
        const startAngle = angleFor(runStart) - halfWidth;
        const endAngle = angleFor(i - 1) + halfWidth;
        const midAngle = (startAngle + endAngle) / 2;
        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        const p1x = round(center + Math.cos(startAngle) * maxRadius);
        const p1y = round(center + Math.sin(startAngle) * maxRadius);
        const p2x = round(center + Math.cos(endAngle) * maxRadius);
        const p2y = round(center + Math.sin(endAngle) * maxRadius);
        quadrants.push({
          code: axes[runStart].groupCode,
          d: `M ${center} ${center} L ${p1x} ${p1y} A ${maxRadius} ${maxRadius} 0 ${largeArc} 1 ${p2x} ${p2y} Z`,
          // Dentro del propio gajo (no en el anillo exterior, donde
          // chocaba con las etiquetas de competencia) — palabra de
          // fondo, grande y tenue, en vez de competir por sitio.
          labelX: round(center + Math.cos(midAngle) * (maxRadius * 0.55)),
          labelY: round(center + Math.sin(midAngle) * (maxRadius * 0.55)),
        });
        runStart = i;
      }
    }
  }

  const wedges = axes
    .map((axis, i) => {
      if (axis.peerAvgValue == null) return null;
      const angle = angleFor(i);
      const r = maxRadius * (axis.peerAvgValue / 5);
      const a1 = angle - halfWidth;
      const a2 = angle + halfWidth;
      const p1x = round(center + Math.cos(a1) * r);
      const p1y = round(center + Math.sin(a1) * r);
      const p2x = round(center + Math.cos(a2) * r);
      const p2y = round(center + Math.sin(a2) * r);
      const color = GROUP_COLORS[axis.groupCode] || "#6b7280";
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
      x: r != null ? round(center + Math.cos(angle) * r) : null,
      y: r != null ? round(center + Math.sin(angle) * r) : null,
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

  // Escala de referencia (1-5) — con Plenitud centrada arriba, el hueco
  // limpio más cercano a la vertical opuesta es el que separa Arquitecto
  // de Catalizador (justo abajo del todo con 5 sectores iguales).
  const scaleAngle = Math.PI / 2;
  const scaleTicks = [1, 2, 3, 4, 5].map((level) => {
    const r = maxRadius * (level / 5);
    return {
      level,
      x: round(center + Math.cos(scaleAngle) * r),
      y: round(center + Math.sin(scaleAngle) * r),
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

  // La tabla ya recibe `axes` ordenado por grupo (línea 39) — aquí solo
  // se detectan los tramos contiguos para meter una fila de cabecera
  // (nombre + color del rol) antes de cada bloque, igual que ya se hace
  // con los gajos de fondo del propio SVG.
  const tableRowGroups: { groupCode: string; rows: typeof axes }[] = [];
  for (const axis of axes) {
    const last = tableRowGroups[tableRowGroups.length - 1];
    if (last && last.groupCode === axis.groupCode) {
      last.rows.push(axis);
    } else {
      tableRowGroups.push({ groupCode: axis.groupCode, rows: [axis] });
    }
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
    <div className="flex flex-col items-center w-full">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}>
        {quadrants.map((q) => (
          <path
            key={`quadrant-${q.code}`}
            d={q.d}
            fill={GROUP_COLORS[q.code] || "#6b7280"}
            opacity={0.07}
          />
        ))}
        {quadrants.map((q) => (
          <text
            key={`quadrant-label-${q.code}`}
            x={q.labelX}
            y={q.labelY}
            fontSize={14}
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={GROUP_COLORS[q.code] || "#6b7280"}
            opacity={0.3}
          >
            {GROUP_LABELS[q.code] || q.code}
          </text>
        ))}
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

      {!showQuadrants && (
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mt-1">
          {groupsPresent.map((code) => (
            <span key={code} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[code] || "#6b7280", opacity: 0.5 }}
              />
              {GROUP_LABELS[code] || code} (media)
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-900" /> Tú
          </span>
        </div>
      )}

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
            {tableRowGroups.map((group) => {
              const color = GROUP_COLORS[group.groupCode] || "#6b7280";
              return (
                <Fragment key={group.groupCode}>
                  <tr>
                    <td
                      colSpan={1 + tableColumns.length}
                      className="px-3 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: `${color}14`, color }}
                    >
                      {GROUP_LABELS[group.groupCode] || group.groupCode}
                    </td>
                  </tr>
                  {group.rows.map((axis) => (
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
                </Fragment>
              );
            })}
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
  const round = (num: number) => Math.round(num * 100) / 100;
  const pts = axes.map((axis, i) => {
    const value = valuesByCode[axis.code];
    if (value == null) return { x: null, y: null };
    const angle = angleFor(i);
    const r = maxRadius * (value / 5);
    return { x: round(center + Math.cos(angle) * r), y: round(center + Math.sin(angle) * r) };
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
