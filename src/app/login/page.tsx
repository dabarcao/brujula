import { signIn } from "@/app/actions/auth";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";

// Marca de la brújula (rediseño 2026-09-17): sustituye la brújula 3D
// dorada/marino original por una aguja en trama de puntos -- misma técnica
// que el reloj de arena del logo de Kairos (verificado a mano sobre su PNG
// real: dos verdes de marca en degradado sobre una retícula de puntos), en
// vez de una paleta propia ajena al sistema de tokens. El anillo, las
// marcas cardinales y el pívot central usan `var(--indigo)`/
// `var(--indigo-deep)` directamente -- ya no hay excepción de color en este
// archivo. Los propios puntos de la aguja sí necesitan hex literal (no se
// puede interpolar un degradado entre dos `var()` en JS de servidor); los
// valores de INDIGO/INDIGO_DEEP de abajo son una copia intencional de esos
// mismos tokens en globals.css -- si esos cambian, actualizar también aquí.
const INDIGO_DEEP: readonly [number, number, number] = [20, 95, 55];
const INDIGO: readonly [number, number, number] = [140, 180, 60];

type NeedleDot = { cx: number; cy: number; r: number; fill: string };

// Aguja como retícula de puntos en diagonal (igual patrón que el reloj de
// arena de Kairos): degradado norte=oscuro / sur=claro, un hueco circular
// en el centro para el pívot. halfW/halfH definen el rombo de la aguja;
// step, la densidad de la trama.
function buildNeedleDots(cx: number, cy: number, halfW: number, halfH: number, step: number, dotR: number): NeedleDot[] {
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

// Fondo decorativo de brújula: la aguja de puntos sobre un anillo fino con
// 4 marcas cardinales, inclinada en 3D (`rotateX`/`rotateY` + sombra CSS)
// para que se lea como un objeto real y no un icono plano -- sin animación:
// es una marca, no un instrumento girando. Opacidad baja para quedar como
// textura ambiental detrás del formulario, nunca compitiendo con él.
// Puramente decorativo: aria-hidden, pointer-events-none (heredado del
// className del caller).
function CompassWatermark({ className = "" }: { className?: string }) {
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
        className="w-full h-full opacity-[0.16]"
        style={{ transform: "rotateX(22deg) rotateY(14deg)", transformStyle: "preserve-3d" }}
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main
      className="flex-1 flex items-center justify-center p-8 relative overflow-hidden"
      style={{
        // Base wash muy sutil (investigación de fondos SaaS): rompe la
        // planitud del `paper` de página sin introducir un color nuevo --
        // solo los dos tonos de paper ya existentes en el sistema.
        background: "radial-gradient(120% 120% at 50% 42%, var(--paper-deep) 0%, var(--paper) 60%)",
      }}
    >
      {/* Relleno de las esquinas vacías (investigación de instrumentos
          HUD): curvas de nivel topográficas muy tenues, hechas con
          `repeating-radial-gradient` -- tres centros de "elevación"
          colocados lejos de la tarjeta, uno por tono ya existente
          (ink/indigo/indigo-deep -- actualizado en el rebrand 2026-09-17;
          antes tenía un azul y un dorado que ya no existen en la paleta),
          para que las esquinas dejen de leerse en blanco sin competir con
          la brújula. La viñeta va encima, en la misma capa, para seguir
          enfocando la mirada al centro (mismo recurso que HBO Max/Discord
          en sus pantallas de acceso). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 50% 50%, transparent 45%, rgba(28,32,58,0.07) 100%)",
            "repeating-radial-gradient(circle at 10% 15%, transparent 0px, transparent 42px, rgba(28,32,58,0.05) 43px, transparent 45px)",
            "repeating-radial-gradient(circle at 92% 85%, transparent 0px, transparent 58px, rgba(140,180,60,0.06) 59px, transparent 61px)",
            "repeating-radial-gradient(circle at 90% 10%, transparent 0px, transparent 50px, rgba(20,95,55,0.05) 51px, transparent 53px)",
            "repeating-radial-gradient(circle at 8% 90%, transparent 0px, transparent 46px, rgba(28,32,58,0.04) 47px, transparent 49px)",
          ].join(", "),
        }}
      />

      {/* Anclada a la esquina inferior derecha y sobredimensionada a
          propósito -- la mayor parte del disco sangra fuera del main
          (que tiene overflow-hidden); solo asoma el cuarto superior-
          izquierdo, lejos del centro donde vive la tarjeta, así el
          anillo/aguja nunca queda tapado. */}
      <CompassWatermark
        className="absolute pointer-events-none select-none right-[-32%] bottom-[-28%] w-[170vw] max-w-none sm:w-[1500px] aspect-square -z-0"
      />

      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center text-center mb-8 gap-3 bg-paper-deep/48 backdrop-blur-sm rounded-brujula-lg px-6 py-5">
          {/* Insignia de cabecera: la misma marca de la aguja en trama de
              puntos que la marca de agua de fondo, sin la inclinación 3D
              (a este tamaño el disco plano se lee mejor que uno girado) --
              mismo logo, no una versión aparte simplificada. Escala similar
              a como Kairos muestra su propio isotipo de puntos en su
              cabecera (~55px). */}
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
          <h1 className="font-heading text-2xl text-ink">Inicia sesión en Brújula</h1>
          <p className="text-sm text-ink-soft">Encuentra tu rumbo, con feedback seguro.</p>
        </div>

        {message && (
          <p className="mb-6 rounded-brujula-md bg-indigo-wash text-indigo-deep text-sm p-3">
            {message}
          </p>
        )}
        {error && (
          <div className="bg-paper-deep/58 backdrop-blur-sm rounded-brujula-md">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        )}

        <div className="bg-paper-deep/58 backdrop-blur-sm rounded-brujula-lg shadow-card border border-line/40 p-8">
          <form action={signIn} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-caption uppercase tracking-wide text-ink-soft">
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="border border-line rounded-brujula-md px-4 py-3 text-sm bg-paper text-ink placeholder:text-ink-soft transition-colors motion-safe:duration-150 focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-wash"
                placeholder="tu@empresa.com"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-caption uppercase tracking-wide text-ink-soft">
                Contraseña
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="border border-line rounded-brujula-md px-4 py-3 text-sm bg-paper text-ink transition-colors motion-safe:duration-150 focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-wash"
              />
            </label>

            <button type="submit" className={`${buttonPrimaryClassName} w-full mt-2`}>
              Entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
