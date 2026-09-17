import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// SaboteadorBar (DESIGN.md `components.saboteador-bar`): barra horizontal
// `{colors.saboteador-tint}` sobre riel `{colors.saboteador-wash}`,
// deliberadamente más suave y de menor contraste que el radar de
// competencias -- pero calibrada para seguir cumpliendo el piso de
// contraste 3:1 como indicador gráfico (DESIGN.md Colors) -- para que el
// bloque de saboteadores (autoevaluación pura, sin comparar con nadie,
// spec.md §7) nunca compita visualmente con el registro confiado del
// resto de la pantalla.
//
// `value`/`max` (default `max=5`, la escala 1-5 de saboteadores en
// EXPERIENCE.md Component Patterns: "one per saboteador ... always shown
// with its 1–5 note printed alongside") calculan el porcentaje de
// relleno; el número se imprime siempre como texto visible junto a la
// barra, nunca solo el medidor -- ese texto es un nodo hermano del propio
// medidor, así que ningún `className` que el caller pase (que solo afecta
// las clases del contenedor) puede hacerlo desaparecer.
//
// Envoltorio puro sobre <div> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
interface SaboteadorBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
}

const SaboteadorBar = forwardRef<HTMLDivElement, SaboteadorBarProps>(
  function SaboteadorBar({ className = "", value, max = 5, ...props }, ref) {
    const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
    return (
      <div
        ref={ref}
        className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}
        {...props}
      >
        <span
          className="flex-1 h-2 rounded-brujula-sm bg-saboteador-wash overflow-hidden block"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          <span
            className="block h-full rounded-brujula-sm bg-saboteador-tint"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="font-data text-caption">{value}</span>
      </div>
    );
  }
);

export default SaboteadorBar;
