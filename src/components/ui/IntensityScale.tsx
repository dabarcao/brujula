import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// IntensityScale (DESIGN.md `components.intensity-scale`): la rampa
// indigo de cinco pasos (`intensity-1`..`intensity-5`), usada para todo
// valor de competencia/acuerdo mostrado como medidor relleno, en
// reemplazo de cualquier tratamiento rojo/verde en el producto (DESIGN.md
// Components, Do's and Don'ts). `value` (1-5) selecciona el paso relleno:
// los pasos 1..value se pintan con su propio color de rampa a opacidad
// plena, los pasos por encima de `value` quedan atenuados -- el mismo
// patrón que la tabla de valores exactos del mock de referencia
// (key-report-reveal.html).
//
// El número se imprime siempre junto al medidor, nunca solo el color
// (DESIGN.md `intensity-scale.valueLabel`, EXPERIENCE.md Accessibility
// Floor) -- es un nodo de texto hermano del propio medidor, así que un
// `className` de contenedor no puede hacerlo desaparecer.
//
// Envoltorio puro sobre <div> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
export type IntensityValue = 1 | 2 | 3 | 4 | 5;

interface IntensityScaleProps extends HTMLAttributes<HTMLDivElement> {
  value: IntensityValue;
}

const STEP_FILL: Record<IntensityValue, string> = {
  1: "bg-intensity-1",
  2: "bg-intensity-2",
  3: "bg-intensity-3",
  4: "bg-intensity-4",
  5: "bg-intensity-5",
};

const STEPS: IntensityValue[] = [1, 2, 3, 4, 5];

const IntensityScale = forwardRef<HTMLDivElement, IntensityScaleProps>(
  function IntensityScale({ className = "", value, ...props }, ref) {
    const clamped = Math.min(5, Math.max(1, Math.round(value))) as IntensityValue;
    return (
      <div
        ref={ref}
        className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={1}
        aria-valuemax={5}
        {...props}
      >
        <span className="inline-flex gap-0.5">
          {STEPS.map((step) => (
            <i
              key={step}
              className={[
                "block w-2.5 h-2.5 rounded-brujula-sm",
                STEP_FILL[step],
                step > clamped ? "opacity-30" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </span>
        <span className="font-data text-caption">{clamped}</span>
      </div>
    );
  }
);

export default IntensityScale;
