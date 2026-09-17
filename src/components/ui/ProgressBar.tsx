import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// ProgressBar (DESIGN.md `components.progress-bar`): riel
// `{colors.line}`, relleno `{colors.indigo}` sólido, `{rounded.full}` --
// una barra de relleno suave, nunca un contador "12 de 30" (el propio
// antipatrón que DESIGN.md rechaza explícitamente para el wizard). `value`/
// `max` solo controlan el porcentaje de relleno; este componente no
// renderiza ningún texto de conteo.
//
// Sin transición de movimiento: AnonymityBadge es el único primitivo de
// este story con una animación en su alcance
// (spec-2-4-feedback-and-status-components.md) -- el "short slide/fade"
// entre preguntas del wizard es un efecto de pantalla (Epic 4), no de
// este primitivo compartido.
//
// Envoltorio puro sobre <div> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
}

const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  function ProgressBar({ className = "", value, max = 100, ...props }, ref) {
    const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
    return (
      <div
        ref={ref}
        className={["w-full h-2 rounded-full bg-line overflow-hidden", className]
          .filter(Boolean)
          .join(" ")}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        {...props}
      >
        <div className="h-full rounded-full bg-indigo" style={{ width: `${pct}%` }} />
      </div>
    );
  }
);

export default ProgressBar;
