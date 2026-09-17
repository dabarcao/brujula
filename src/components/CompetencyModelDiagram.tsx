"use client";

import { useState } from "react";
import { GROUP_COLORS, GROUP_ORDER } from "@/components/CompetencyRadar";
import { FormattedInline, FormattedParagraphs } from "@/components/FormattedText";

// Story 7.3 (Biblioteca): the full competency model drawn as the same
// 16-axis / 5-sector shape as CompetencyRadar (geometry copied, not
// imported -- CompetencyRadar draws data series this diagram has none of),
// but clickable and with zero hardcoded copy: every name/description on
// screen (framework intro, role, competency, threshold) comes from the
// `frameworks`/`roles`/`frameworkIntro`/`plenitudDescription` props, which
// the page reads straight from membersManager's competency_* catalogs.
// Quadrant/legend labels use each role's real DB `name` (e.g. "Visión"),
// never the GROUP_LABELS presentation constant other report views use --
// that constant is a shared fallback for places with no live role row to
// read from; here we always have one.

type Framework = {
  code: string;
  name: string;
  description: string | null;
  thresholdHigh: string | null;
  thresholdLow: string | null;
  groupCode: string;
};

type Role = {
  code: string;
  name: string;
  description: string | null;
};

type Selected =
  | { kind: "framework" }
  | { kind: "group"; code: string }
  | { kind: "competency"; code: string }
  | null;

export default function CompetencyModelDiagram({
  frameworkIntro,
  frameworks,
  roles,
  plenitudDescription,
  size = 440,
}: {
  frameworkIntro: { name: string; description: string } | null;
  frameworks: Framework[];
  roles: Role[];
  plenitudDescription: string;
  size?: number;
}) {
  const [selected, setSelected] = useState<Selected>(null);

  const roleByCode = new Map(roles.map((r) => [r.code, r]));
  const groupLabel = (code: string) => (code === "plenitud" ? "Plenitud" : roleByCode.get(code)?.name || code);

  const axes = [...frameworks].sort(
    (a, b) => (GROUP_ORDER[a.groupCode] ?? 99) - (GROUP_ORDER[b.groupCode] ?? 99)
  );
  const n = axes.length;
  const round = (num: number) => Math.round(num * 100) / 100;

  const groupsPresent = Array.from(new Set(axes.map((a) => a.groupCode))).sort(
    (a, b) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99)
  );

  const center = size / 2;
  const maxRadius = center - 100;
  const halfWidth = n > 0 ? Math.PI / n : 0;

  const firstGroupSize = axes.filter((a) => a.groupCode === axes[0]?.groupCode).length;
  const centerIndex = (firstGroupSize - 1) / 2;
  const angleFor = (i: number) => (n === 0 ? 0 : ((Math.PI * 2) / n) * (i - centerIndex) - Math.PI / 2);

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

  const quadrants: { code: string; d: string; labelX: number; labelY: number }[] = [];
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

  const selectedInfo = (() => {
    if (!selected) return null;
    if (selected.kind === "framework") {
      return frameworkIntro
        ? { name: frameworkIntro.name, description: frameworkIntro.description, thresholdHigh: null, thresholdLow: null }
        : null;
    }
    if (selected.kind === "group") {
      if (selected.code === "plenitud") {
        return { name: "Plenitud", description: plenitudDescription, thresholdHigh: null, thresholdLow: null };
      }
      const role = roleByCode.get(selected.code);
      return role
        ? { name: role.name, description: role.description || "", thresholdHigh: null, thresholdLow: null }
        : null;
    }
    const fw = frameworks.find((f) => f.code === selected.code);
    return fw
      ? {
          name: fw.name,
          description: fw.description || "",
          thresholdHigh: fw.thresholdHigh,
          thresholdLow: fw.thresholdLow,
        }
      : null;
  })();

  return (
    <div className="flex flex-col items-center w-full">
      {frameworkIntro && (
        <button
          type="button"
          onClick={() => setSelected({ kind: "framework" })}
          className={
            "w-full text-left border rounded-brujula-md px-4 py-3 mb-6 transition-colors " +
            (selected?.kind === "framework" ? "border-ink-soft bg-surface-2" : "border-line hover:border-ink-soft")
          }
        >
          <p className="text-sm font-semibold text-ink">{frameworkIntro.name}</p>
          <p className="text-xs text-ink-soft mt-0.5">
            El marco general en el que se apoya todo lo de abajo — haz clic para leerlo.
          </p>
        </button>
      )}
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}>
        {quadrants.map((q) => {
          const isSelected = selected?.kind === "group" && selected.code === q.code;
          return (
            <path
              key={`quadrant-${q.code}`}
              d={q.d}
              fill={GROUP_COLORS[q.code] || "#6b7280"}
              opacity={isSelected ? 0.22 : 0.07}
              className="cursor-pointer transition-opacity"
              onClick={() => setSelected({ kind: "group", code: q.code })}
            />
          );
        })}
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
            opacity={0.35}
            className="pointer-events-none"
          >
            {groupLabel(q.code)}
          </text>
        ))}
        {[1, 2, 3, 4, 5].map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={maxRadius * (level / 5)}
            fill="none"
            stroke="var(--line)"
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
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))}
        {points.map((p) => {
          const isSelected = selected?.kind === "competency" && selected.code === p.code;
          return (
            <text
              key={`label-${p.code}`}
              x={p.labelX}
              y={p.labelY}
              fontSize={isSelected ? 11 : 9.5}
              fontWeight={isSelected ? 700 : 400}
              textAnchor={
                Math.abs(p.labelX - center) < 4 ? "middle" : p.labelX > center ? "start" : "end"
              }
              dominantBaseline="middle"
              fill={p.color}
              className="cursor-pointer"
              onClick={() => setSelected({ kind: "competency", code: p.code })}
            >
              {p.name}
            </text>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-ink-soft mt-1">
        {groupsPresent.map((code) => (
          <button key={code} type="button" onClick={() => setSelected({ kind: "group", code })} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: GROUP_COLORS[code] || "#6b7280" }}
            />
            {groupLabel(code)}
          </button>
        ))}
      </div>

      <div className="mt-6 w-full border border-line rounded-brujula-md p-4 min-h-[7rem]">
        {selectedInfo ? (
          <>
            <p className="text-sm font-semibold text-ink mb-1.5">{selectedInfo.name}</p>
            <div className="text-sm text-ink-soft">
              <FormattedParagraphs text={selectedInfo.description} />
            </div>
            {(selectedInfo.thresholdHigh || selectedInfo.thresholdLow) && (
              <div className="mt-3 flex flex-col gap-2">
                {selectedInfo.thresholdHigh && (
                  <p className="text-sm text-ink-soft">
                    <span className="font-bold text-ink">Valor alto: </span>
                    <FormattedInline text={selectedInfo.thresholdHigh} />
                  </p>
                )}
                {selectedInfo.thresholdLow && (
                  <p className="text-sm text-ink-soft">
                    <span className="font-bold text-ink">Valor bajo: </span>
                    <FormattedInline text={selectedInfo.thresholdLow} />
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            Haz clic en Plenitud, en un rol, o en el nombre de una competencia para ver su explicación aquí.
          </p>
        )}
      </div>
    </div>
  );
}
