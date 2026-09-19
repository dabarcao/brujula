// Gráfico de araña del comparativo de competencias, en las primitivas
// <Svg> de react-pdf -- geometría portada literal de
// src/components/CompetencyComparisonChart.tsx (misma fórmula de ángulos/
// radios, mismos colores por rol), sin la interactividad (los chips de
// categoría no tienen sentido en un PDF estático: la tabla de abajo ya
// enseña siempre todas las columnas). Colores en hex literal -- react-pdf
// no puede leer custom properties de CSS.

import { Svg, Circle, Line, Path, Text as SvgTextRaw } from "@react-pdf/renderer";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";

// react-pdf's own .d.ts types SVG <Text>'s props too narrowly (no
// fontSize/fontWeight, even though its actual renderer reads both fine on
// an SVG-nested Text -- same as the regular document Text) -- this
// wrapper is the one place that works around it, instead of an `as any`
// at every call site below.
function SvgText(props: {
  x: number;
  y: number;
  fontSize: number;
  fontWeight?: number;
  textAnchor?: "start" | "middle" | "end";
  fill: string;
  fillOpacity?: number;
  children: ReactNode;
}) {
  const Component = SvgTextRaw as unknown as (p: typeof props) => ReactNode;
  return <Component {...props} />;
}

export const GROUP_COLORS: Record<string, string> = {
  plenitud: "#dc2626",
  visionario: "#2563eb",
  arquitecto: "#059669",
  catalizador: "#f97316",
  coach: "#eab308",
};

export const GROUP_LABELS: Record<string, string> = {
  visionario: "Visión",
  arquitecto: "Arquitecto",
  catalizador: "Catalizador",
  coach: "Coach",
  plenitud: "Plenitud",
};

const GROUP_ORDER: Record<string, number> = {
  plenitud: 0,
  visionario: 1,
  arquitecto: 2,
  catalizador: 3,
  coach: 4,
};

const EVALUATOR_CATEGORY_LABELS: Record<string, string> = {
  manager: "Jefe / responsable directo",
  team: "Compañero de equipo",
  organization: "Compañero de la empresa",
  other: "Otro",
};

const DEFAULT_COLOR = "#6b7280";

export type PdfChartAxis = {
  code: string;
  name: string;
  groupCode: string;
  peerAvgValue: number | null;
  selfValue: number | null;
};

export type PdfChartCategorySeries = {
  category: string;
  valuesByCode: Record<string, number>;
};

const styles = StyleSheet.create({
  wrap: { alignItems: "center", width: "100%" },
  table: { width: "100%", marginTop: 10, fontSize: 8 },
  headerRow: { flexDirection: "row", backgroundColor: "#EFEADD" },
  groupRow: { flexDirection: "row" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E4DFD3" },
  cellName: { flex: 2, padding: 4 },
  cellValue: { flex: 1, padding: 4, textAlign: "right" },
  headerCell: { fontWeight: 700, color: "#5B5F7A" },
  groupCell: { flex: 1, padding: 3, fontWeight: 700 },
});

export function PdfCompetencyChart({
  axes: rawAxes,
  categorySeries,
  size = 300,
  selfLabel = "Tú",
  peerLabel = "Media",
}: {
  axes: PdfChartAxis[];
  categorySeries: PdfChartCategorySeries[];
  size?: number;
  selfLabel?: string;
  peerLabel?: string;
}) {
  const axes = [...rawAxes].sort(
    (a, b) => (GROUP_ORDER[a.groupCode] ?? 99) - (GROUP_ORDER[b.groupCode] ?? 99)
  );
  const n = axes.length;
  if (n === 0) return null;

  const groupsPresent = Array.from(new Set(axes.map((a) => a.groupCode))).sort(
    (a, b) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99)
  );
  const showQuadrants = groupsPresent.length > 1;

  const center = size / 2;
  const maxRadius = center - (showQuadrants ? 68 : 60);
  const halfWidth = Math.PI / n;

  const firstGroupSize = axes.filter((a) => a.groupCode === axes[0]?.groupCode).length;
  const centerIndex = (firstGroupSize - 1) / 2;
  const angleFor = (i: number) => ((Math.PI * 2) / n) * (i - centerIndex) - Math.PI / 2;
  const round = (num: number) => Math.round(num * 100) / 100;

  const points = axes.map((axis, i) => {
    const angle = angleFor(i);
    const color = GROUP_COLORS[axis.groupCode] || DEFAULT_COLOR;
    return {
      ...axis,
      color,
      axisX: round(center + Math.cos(angle) * maxRadius),
      axisY: round(center + Math.sin(angle) * maxRadius),
      labelX: round(center + Math.cos(angle) * (maxRadius + 11)),
      labelY: round(center + Math.sin(angle) * (maxRadius + 11)),
    };
  });

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
      const color = GROUP_COLORS[axis.groupCode] || DEFAULT_COLOR;
      return { code: axis.code, color, d: `M ${center} ${center} L ${p1x} ${p1y} A ${r} ${r} 0 0 1 ${p2x} ${p2y} Z` };
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

  const scaleAngle = Math.PI / 2;
  const scaleTicks = [1, 2, 3, 4, 5].map((level) => {
    const r = maxRadius * (level / 5);
    return { level, x: round(center + Math.cos(scaleAngle) * r), y: round(center + Math.sin(scaleAngle) * r) };
  });

  const seriesByCategory = new Map(categorySeries.map((s) => [s.category, s.valuesByCode]));
  const tableColumns: { key: string; label: string; getValue: (axis: (typeof axes)[number]) => number | null }[] = [
    { key: "peer", label: peerLabel, getValue: (axis) => axis.peerAvgValue },
  ];
  if (hasAnySelf) {
    tableColumns.push({ key: "self", label: selfLabel, getValue: (axis) => axis.selfValue });
  }
  for (const series of categorySeries) {
    tableColumns.push({
      key: series.category,
      label: EVALUATOR_CATEGORY_LABELS[series.category] || series.category,
      getValue: (axis) => seriesByCategory.get(series.category)?.[axis.code] ?? null,
    });
  }

  const tableRowGroups: { groupCode: string; rows: typeof axes }[] = [];
  for (const axis of axes) {
    const last = tableRowGroups[tableRowGroups.length - 1];
    if (last && last.groupCode === axis.groupCode) last.rows.push(axis);
    else tableRowGroups.push({ groupCode: axis.groupCode, rows: [axis] });
  }

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {quadrants.map((q) => (
          <Path key={`q-${q.code}`} d={q.d} fill={GROUP_COLORS[q.code] || DEFAULT_COLOR} fillOpacity={0.07} />
        ))}
        {quadrants.map((q) => (
          <SvgText
            key={`ql-${q.code}`}
            x={q.labelX}
            y={q.labelY}
            fontSize={9}
            fontWeight={700}
            textAnchor="middle"
            fill={GROUP_COLORS[q.code] || DEFAULT_COLOR}
            fillOpacity={0.35}
          >
            {GROUP_LABELS[q.code] || q.code}
          </SvgText>
        ))}
        {[1, 2, 3, 4, 5].map((level) => (
          <Circle key={level} cx={center} cy={center} r={maxRadius * (level / 5)} fill="none" stroke="#e5e7eb" strokeWidth={1} />
        ))}
        {points.map((p) => (
          <Line key={`ax-${p.code}`} x1={center} y1={center} x2={p.axisX} y2={p.axisY} stroke="#e5e7eb" strokeWidth={1} />
        ))}
        {wedges.map((w) => (
          <Path key={`w-${w.code}`} d={w.d} fill={w.color} fillOpacity={0.22} />
        ))}
        {hasAnySelf &&
          selfSegments.map((d, i) => <Path key={`s-${i}`} d={d} fill="none" stroke="#111827" strokeWidth={1.6} />)}
        {hasAnySelf &&
          selfPoints.map((p) =>
            p.x != null && p.y != null ? <Circle key={`sd-${p.code}`} cx={p.x} cy={p.y} r={2.6} fill="#111827" /> : null
          )}
        {scaleTicks.map((tick) => (
          <SvgText key={`sc-${tick.level}`} x={tick.x} y={tick.y} fontSize={6.5} textAnchor="middle" fill="#9ca3af">
            {tick.level}
          </SvgText>
        ))}
        {points.map((p) => (
          <SvgText
            key={`lb-${p.code}`}
            x={p.labelX}
            y={p.labelY}
            fontSize={6.8}
            textAnchor={Math.abs(p.labelX - center) < 4 ? "middle" : p.labelX > center ? "start" : "end"}
            fill={p.color}
          >
            {p.name}
          </SvgText>
        ))}
      </Svg>

      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.cellName, styles.headerCell]}>Competencia</Text>
          {tableColumns.map((col) => (
            <Text key={col.key} style={[styles.cellValue, styles.headerCell]}>
              {col.label}
            </Text>
          ))}
        </View>
        {tableRowGroups.map((group) => {
          const color = GROUP_COLORS[group.groupCode] || DEFAULT_COLOR;
          return (
            <View key={group.groupCode} wrap={false}>
              <View style={styles.groupRow}>
                <Text style={[styles.groupCell, { color }]}>{GROUP_LABELS[group.groupCode] || group.groupCode}</Text>
              </View>
              {group.rows.map((axis) => (
                <View key={axis.code} style={styles.row}>
                  <Text style={styles.cellName}>{axis.name}</Text>
                  {tableColumns.map((col) => {
                    const value = col.getValue(axis);
                    return (
                      <Text key={col.key} style={styles.cellValue}>
                        {value != null ? value.toFixed(1) : "—"}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}
