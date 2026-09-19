// Marca de la brújula, en las primitivas <Svg> de react-pdf -- no se puede
// reutilizar src/components/ui/CompassBrand.tsx tal cual (JSX de HTML/CSS,
// custom properties que react-pdf no puede leer), pero SÍ su geometría:
// buildNeedleDots se porta literal, mismos parámetros que ya usan
// CompassBadge/CompassWatermark/opengraph-image.tsx. Colores en hex
// literal (mismos que ya usa opengraph-image.tsx por el mismo motivo).

import { Svg, Circle, Line, G } from "@react-pdf/renderer";

const INDIGO_DEEP: readonly [number, number, number] = [20, 95, 55];
const INDIGO: readonly [number, number, number] = [140, 180, 60];
const PAPER = "#F7F4EE";

type NeedleDot = { cx: number; cy: number; r: number; fill: string };

function buildNeedleDots(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  step: number,
  dotR: number
): NeedleDot[] {
  const dots: NeedleDot[] = [];
  for (let y = -halfH; y <= halfH; y += step) {
    const rowIndex = Math.round((y + halfH) / step);
    const offset = (rowIndex % 2) * (step / 2);
    for (let x = -halfW - step; x <= halfW + step; x += step) {
      const xx = x + offset;
      if (Math.abs(xx) / halfW + Math.abs(y) / halfH > 1) continue;
      if (Math.hypot(xx, y) < dotR * 4.5) continue;
      const t = (y + halfH) / (2 * halfH);
      const r = Math.round(INDIGO_DEEP[0] + (INDIGO[0] - INDIGO_DEEP[0]) * t);
      const g = Math.round(INDIGO_DEEP[1] + (INDIGO[1] - INDIGO_DEEP[1]) * t);
      const b = Math.round(INDIGO_DEEP[2] + (INDIGO[2] - INDIGO_DEEP[2]) * t);
      dots.push({ cx: cx + xx, cy: cy + y, r: dotR, fill: `rgb(${r}, ${g}, ${b})` });
    }
  }
  return dots;
}

/** Insignia de la portada (ring + aguja de puntos + pivote), mismo diseño que CompassBadge. */
export function PdfCompassBadge({ size = 72 }: { size?: number }) {
  const dots = buildNeedleDots(32, 32, 11, 25, 3, 0.9);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={27} fill="none" stroke="#8CB43C" strokeWidth={2.4} />
      <Line x1={32} y1={7} x2={32} y2={10.5} stroke="#145F37" strokeWidth={1.6} />
      <Line x1={32} y1={53.5} x2={32} y2={57} stroke="#145F37" strokeWidth={1.6} />
      <Line x1={7} y1={32} x2={10.5} y2={32} stroke="#145F37" strokeWidth={1.6} />
      <Line x1={53.5} y1={32} x2={57} y2={32} stroke="#145F37" strokeWidth={1.6} />
      <G>
        {dots.map((d, i) => (
          <Circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
        ))}
      </G>
      <Circle cx={32} cy={32} r={2.2} fill={PAPER} stroke="#145F37" strokeWidth={1} />
    </Svg>
  );
}

/**
 * Marca de agua muy tenue para el fondo de la portada -- a diferencia de
 * CompassWatermark.tsx (web), aquí `opacity` se aplica POR FORMA
 * (fillOpacity/strokeOpacity en cada círculo/línea), no como un envoltorio
 * <Svg style={{opacity}}> alrededor de todo: react-pdf/PDFKit no componen
 * grupos con opacidad como lo haría CSS -- un wrapper así se vio renderizar
 * prácticamente opaco (cada forma hija ignoraba la opacidad del padre).
 */
export function PdfWatermark({ size = 260, opacity = 0.05 }: { size?: number; opacity?: number }) {
  const dots = buildNeedleDots(120, 120, 38, 88, 6, 1.9);
  const ticks: [number, number, number, number][] = [
    [120, 24, 120, 35],
    [120, 205, 120, 216],
    [24, 120, 35, 120],
    [205, 120, 216, 120],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Circle cx={120} cy={120} r={96} fill="none" stroke="#8CB43C" strokeWidth={6} strokeOpacity={opacity} />
      <Circle cx={120} cy={120} r={90.5} fill="none" stroke="#145F37" strokeOpacity={opacity * 0.4} strokeWidth={1} />
      {ticks.map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#145F37" strokeWidth={2.5} strokeOpacity={opacity} />
      ))}
      {dots.map((d, i) => (
        <Circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} fillOpacity={opacity} />
      ))}
      <Circle cx={120} cy={120} r={6.5} fill={PAPER} fillOpacity={opacity} stroke="#145F37" strokeOpacity={opacity} strokeWidth={1.6} />
    </Svg>
  );
}
