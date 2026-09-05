// Gráfico de araña dibujado a mano en SVG (sin librería de gráficos: es
// geometría fija de 14 ejes conocidos, no justifica una dependencia nueva).
// Server Component — no necesita "use client", no hay interactividad.

type Axis = {
  code: string;
  name: string;
  principleCode: string;
  avgValue: number | null;
  // Autoevaluación del propio empleado — solo se rellena en el
  // comparativo del ciclo 360 (ver get_request_competency_comparison).
  // Cuando ningún eje la trae, no se dibuja la serie negra.
  selfValue?: number | null;
};

const PRINCIPLE_COLORS: Record<string, string> = {
  evolutionary_purpose: "#2563eb",
  self_organizing_team: "#059669",
  wholeness: "#ea580c",
};

const DEFAULT_COLOR = "#6b7280";

const PRINCIPLE_ORDER: Record<string, number> = {
  evolutionary_purpose: 0,
  self_organizing_team: 1,
  wholeness: 2,
};

const PRINCIPLE_LABELS: Record<string, string> = {
  evolutionary_purpose: "Propósito evolutivo",
  self_organizing_team: "Equipo autoorganizado",
  wholeness: "Plenitud",
};

export default function CompetencyRadar({ axes: rawAxes }: { axes: Axis[] }) {
  // Los ejes siempre se agrupan por dimensión antes de dibujarlos, sin
  // importar en qué orden lleguen desde la consulta — si no, los colores
  // de las 3 dimensiones salen intercalados alrededor del círculo en vez
  // de en 3 bloques contiguos.
  const axes = [...rawAxes].sort(
    (a, b) => (PRINCIPLE_ORDER[a.principleCode] ?? 99) - (PRINCIPLE_ORDER[b.principleCode] ?? 99)
  );
  const size = 440;
  const center = size / 2;
  const maxRadius = center - 90;
  const n = axes.length;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const points = axes.map((axis, i) => {
    const angle = angleFor(i);
    const color = PRINCIPLE_COLORS[axis.principleCode] || DEFAULT_COLOR;
    const hasValue = axis.avgValue != null;
    const dataRadius = hasValue ? maxRadius * ((axis.avgValue as number) / 5) : null;
    return {
      ...axis,
      color,
      axisX: center + Math.cos(angle) * maxRadius,
      axisY: center + Math.sin(angle) * maxRadius,
      labelX: center + Math.cos(angle) * (maxRadius + 16),
      labelY: center + Math.sin(angle) * (maxRadius + 16),
      dataX: dataRadius != null ? center + Math.cos(angle) * dataRadius : null,
      dataY: dataRadius != null ? center + Math.sin(angle) * dataRadius : null,
    };
  });

  const rings = [1, 2, 3, 4, 5].map((level) => {
    const r = maxRadius * (level / 5);
    const ringPoints = axes
      .map((_, i) => {
        const angle = angleFor(i);
        return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
      })
      .join(" ");
    return { level, ringPoints };
  });

  const segments: { d: string; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a.dataX != null && a.dataY != null && b.dataX != null && b.dataY != null) {
      segments.push({
        d: `M ${a.dataX} ${a.dataY} L ${b.dataX} ${b.dataY}`,
        color: "#9ca3af",
      });
    }
  }

  const hasAnySelf = axes.some((axis) => axis.selfValue != null);
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
  const selfSegments: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = selfPoints[i];
    const b = selfPoints[(i + 1) % n];
    if (a.x != null && a.y != null && b.x != null && b.y != null) {
      selfSegments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 480 }}>
        {rings.map((ring) => (
          <polygon
            key={ring.level}
            points={ring.ringPoints}
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
        {segments.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={2} />
        ))}
        {points.map((p) =>
          p.dataX != null && p.dataY != null ? (
            <circle key={`dot-${p.code}`} cx={p.dataX} cy={p.dataY} r={4} fill={p.color} />
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
              style={{ backgroundColor: PRINCIPLE_COLORS[code] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
