// Gráfico de araña dibujado a mano en SVG (sin librería de gráficos: es
// geometría fija de N ejes conocidos, no justifica una dependencia nueva).
// Server Component — no necesita "use client", no hay interactividad.
//
// Un mismo componente sirve tanto para el radar grande de los 4 roles
// VACC (12 ejes) como para el mini-radar de Plenitud (3 ejes) — Plenitud
// no vive dentro de ningún rol (docs/modelo_roles_vacc.md), así que se
// dibuja aparte en vez de mezclada en el mismo círculo ("Opción A").

type Axis = {
  code: string;
  name: string;
  // Rol VACC (visionario/arquitecto/catalizador/coach) para el radar
  // grande, o "plenitud" para el mini-radar — un solo grupo, un solo
  // color, sin necesidad de leyenda con 5 entradas a la vez.
  groupCode: string;
  avgValue: number | null;
  // Autoevaluación del propio empleado — solo se rellena en el
  // comparativo del ciclo 360 (ver get_request_competency_comparison).
  // Cuando ningún eje la trae, no se dibuja la serie negra.
  selfValue?: number | null;
};

export const GROUP_COLORS: Record<string, string> = {
  visionario: "#2563eb",
  arquitecto: "#059669",
  catalizador: "#ea580c",
  // Antes violeta (#7c3aed) — coincidía exactamente con el color de la
  // categoría de evaluador "Jefe" (CompetencyComparisonChart), que se
  // ve en el mismo gráfico. Verde-lima: distinto del azul de Visionario
  // y del ámbar que ya usa "Compañero de la empresa".
  coach: "#65a30d",
  plenitud: "#dc2626",
};

const DEFAULT_COLOR = "#6b7280";

export const GROUP_ORDER: Record<string, number> = {
  visionario: 0,
  arquitecto: 1,
  catalizador: 2,
  coach: 3,
  plenitud: 4,
};

export const GROUP_LABELS: Record<string, string> = {
  visionario: "Visionario",
  arquitecto: "Arquitecto",
  catalizador: "Catalizador",
  coach: "Coach",
  plenitud: "Plenitud",
};

export default function CompetencyRadar({
  axes: rawAxes,
  size = 440,
  caption,
}: {
  axes: Axis[];
  // Más pequeño para el mini-radar de Plenitud, que solo tiene 3 ejes y
  // se dibuja junto al grande, no a su mismo tamaño.
  size?: number;
  caption?: string;
}) {
  // Los ejes siempre se agrupan por rol antes de dibujarlos, sin
  // importar en qué orden lleguen desde la consulta — si no, los colores
  // de cada grupo salen intercalados alrededor del círculo en vez de en
  // bloques contiguos.
  const axes = [...rawAxes].sort(
    (a, b) => (GROUP_ORDER[a.groupCode] ?? 99) - (GROUP_ORDER[b.groupCode] ?? 99)
  );
  const n = axes.length;
  // Redondeado a 2 decimales: Math.cos/Math.sin pueden dar un último
  // dígito distinto entre el render de servidor y el del navegador (el
  // mismo cálculo, pero motores JS distintos) — con 15 decimales de
  // precisión en el string, eso ya basta para que React marque un
  // desajuste de hidratación. Redondear absorbe esa diferencia.
  const round = (num: number) => Math.round(num * 100) / 100;

  // Solo los grupos que de verdad están representados en estos ejes —
  // así el mini-radar de Plenitud no arrastra una leyenda ni un tinte de
  // cuadrante para los 4 roles que no dibuja (solo tiene sentido marcar
  // cuadrantes cuando hay más de un grupo).
  const groupsPresent = Array.from(new Set(axes.map((a) => a.groupCode))).sort(
    (a, b) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99)
  );
  const showQuadrants = groupsPresent.length > 1;

  const center = size / 2;
  // Con etiqueta de rol por cuadrante hace falta algo más de margen que
  // con solo las etiquetas de competencia.
  const maxRadius = center - (showQuadrants ? 100 : 90);

  const halfWidth = Math.PI / n;
  // Girado medio hueco respecto al cálculo ingenuo: así el límite entre
  // el último grupo y el primero cae justo en las 12:00 (arriba del
  // todo), en vez de que el primer EJE se siente ahí y su cuadrante se
  // reparta medio hueco a cada lado de esa línea.
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2 + halfWidth;

  const points = axes.map((axis, i) => {
    const angle = angleFor(i);
    const color = GROUP_COLORS[axis.groupCode] || DEFAULT_COLOR;
    const hasValue = axis.avgValue != null;
    const dataRadius = hasValue ? maxRadius * ((axis.avgValue as number) / 5) : null;
    return {
      ...axis,
      color,
      axisX: round(center + Math.cos(angle) * maxRadius),
      axisY: round(center + Math.sin(angle) * maxRadius),
      labelX: round(center + Math.cos(angle) * (maxRadius + 16)),
      labelY: round(center + Math.sin(angle) * (maxRadius + 16)),
      dataX: dataRadius != null ? round(center + Math.cos(angle) * dataRadius) : null,
      dataY: dataRadius != null ? round(center + Math.sin(angle) * dataRadius) : null,
    };
  });

  const rings = [1, 2, 3, 4, 5].map((level) => {
    const r = maxRadius * (level / 5);
    const ringPoints = axes
      .map((_, i) => {
        const angle = angleFor(i);
        return `${round(center + Math.cos(angle) * r)},${round(center + Math.sin(angle) * r)}`;
      })
      .join(" ");
    return { level, ringPoints };
  });

  // Un gajo de fondo por rol, del centro hasta el borde — deja claro a
  // qué cuadrante pertenece cada competencia sin tener que leer la
  // leyenda de abajo. Solo con más de un grupo (nunca en el mini-radar
  // de Plenitud, que es un único grupo).
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
          // chocaba con las etiquetas de competencia) — una palabra de
          // fondo, grande y tenue, en vez de competir por sitio.
          labelX: round(center + Math.cos(midAngle) * (maxRadius * 0.55)),
          labelY: round(center + Math.sin(midAngle) * (maxRadius * 0.55)),
        });
        runStart = i;
      }
    }
  }

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
      x: r != null ? round(center + Math.cos(angle) * r) : null,
      y: r != null ? round(center + Math.sin(angle) * r) : null,
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
    <div className="flex flex-col items-center" style={{ width: "100%", maxWidth: size }}>
      {caption && <p className="text-xs text-gray-500 mb-2 text-center">{caption}</p>}
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}>
        {quadrants.map((q) => (
          <path key={`quadrant-${q.code}`} d={q.d} fill={GROUP_COLORS[q.code] || DEFAULT_COLOR} opacity={0.07} />
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
            fill={GROUP_COLORS[q.code] || DEFAULT_COLOR}
            opacity={0.3}
          >
            {GROUP_LABELS[q.code] || q.code}
          </text>
        ))}
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
      {!showQuadrants && (
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mt-1">
          {groupsPresent.map((code) => (
            <span key={code} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[code] || DEFAULT_COLOR }}
              />
              {GROUP_LABELS[code] || code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
