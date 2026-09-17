// Marca de la brújula, extraída de src/app/login/page.tsx (rediseño
// 2026-09-17) para poder reusarla también en /registro y, si se decide
// después de probarlo, como tapiz de fondo en el resto de la app -- antes
// vivía solo ahí, duplicarla en cada pantalla habría desincronizado el
// degradado/geometría en cuanto una cambiara. Aguja en trama de puntos,
// misma técnica que el reloj de arena del logo de Kairos (verificado a
// mano sobre su PNG real): dos verdes de marca en degradado sobre una
// retícula de puntos, no una paleta propia ajena al sistema de tokens.
const INDIGO_DEEP: readonly [number, number, number] = [20, 95, 55];
const INDIGO: readonly [number, number, number] = [140, 180, 60];

type NeedleDot = { cx: number; cy: number; r: number; fill: string };

/** Aguja como retícula de puntos en diagonal: degradado norte=oscuro / sur=claro, un hueco circular en el centro para el pívot. halfW/halfH definen el rombo de la aguja; step, la densidad de la trama. */
export function buildNeedleDots(
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

/** Insignia pequeña de cabecera (~55px): mismo logo que la marca de agua, sin la inclinación 3D -- a este tamaño el disco plano se lee mejor que uno girado. */
export function CompassBadge() {
  return (
    <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-wash">
      <svg aria-hidden="true" viewBox="0 0 64 64" width="40" height="40" focusable="false">
        <defs>
          <linearGradient id="brujula-ring-grad-badge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--indigo)" />
            <stop offset="55%" stopColor="var(--indigo)" />
            <stop offset="100%" stopColor="var(--indigo-deep)" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="27" fill="none" stroke="url(#brujula-ring-grad-badge)" strokeWidth="2.4" />
        <line x1="32" y1="7" x2="32" y2="10.5" stroke="var(--indigo-deep)" strokeWidth="1.6" />
        <line x1="32" y1="53.5" x2="32" y2="57" stroke="var(--indigo-deep)" strokeWidth="1.6" />
        <line x1="7" y1="32" x2="10.5" y2="32" stroke="var(--indigo-deep)" strokeWidth="1.6" />
        <line x1="53.5" y1="32" x2="57" y2="32" stroke="var(--indigo-deep)" strokeWidth="1.6" />
        {buildNeedleDots(32, 32, 11, 25, 3, 0.9).map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
        ))}
        <circle cx="32" cy="32" r="2.2" fill="var(--paper)" stroke="var(--indigo-deep)" strokeWidth="1" />
      </svg>
    </span>
  );
}

/**
 * Fondo decorativo de brújula: la aguja de puntos sobre un anillo fino con
 * 4 marcas cardinales, inclinada en 3D para que se lea como un objeto real
 * y no un icono plano -- sin animación: es una marca, no un instrumento
 * girando. Puramente decorativo: aria-hidden, pointer-events-none
 * (heredado del className del caller).
 *
 * `opacity` es un parámetro, no un valor fijo (2026-09-17): el mismo 0.07
 * que se lee bien en /login (fondo propio con degradado + viñeta en las
 * esquinas, que ya ayuda a camuflarla) se veía "súper sólida" en el
 * dashboard (fondo plano, sin ese tratamiento) -- cada pantalla pasa la
 * suya en vez de compartir un único valor a ciegas. Por defecto 0.07,
 * el mismo que ya tenía /login antes de este cambio.
 */
export function CompassWatermark({
  className = "",
  opacity = 0.07,
}: {
  className?: string;
  opacity?: number;
}) {
  const dots = buildNeedleDots(120, 120, 38, 88, 6, 1.9);
  const ticks: [number, number, number, number][] = [
    [120, 24, 120, 35],
    [120, 205, 120, 216],
    [24, 120, 35, 120],
    [205, 120, 216, 120],
  ];

  return (
    <div aria-hidden="true" className={className} style={{ perspective: "1400px" }}>
      <div
        className="w-full h-full"
        style={{ opacity, transform: "rotateX(22deg) rotateY(14deg)", transformStyle: "preserve-3d" }}
      >
        <svg viewBox="0 0 240 240" className="w-full h-full" focusable="false">
          <defs>
            <linearGradient id="brujula-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--indigo)" />
              <stop offset="55%" stopColor="var(--indigo)" />
              <stop offset="100%" stopColor="var(--indigo-deep)" />
            </linearGradient>
          </defs>

          <circle cx="120" cy="120" r="96" fill="none" stroke="url(#brujula-ring-grad)" strokeWidth="6" />
          <circle cx="120" cy="120" r="90.5" fill="none" stroke="var(--indigo-deep)" strokeOpacity="0.14" strokeWidth="1" />

          {ticks.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--indigo-deep)" strokeWidth="2.5" />
          ))}

          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
          ))}

          <circle cx="120" cy="120" r="6.5" fill="var(--paper)" stroke="var(--indigo-deep)" strokeWidth="1.6" />
        </svg>
      </div>
    </div>
  );
}
