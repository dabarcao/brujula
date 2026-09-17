import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// Card (DESIGN.md `components.card`): la unidad base "color-blocked" del
// sistema -- fondo `paper-deep` (blanco) sobre el `paper` cálido de la
// página, `rounded-brujula-lg`, `elevation.card` y `{spacing.6}` de padding.
// El mapa de competencias, saboteadores, narrativa IA y encabezado de
// informe se renderizan como hermanos de este componente
// (spec-2-3-card-system.md).
//
// Envoltorio puro sobre <div> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className = "", ...props }, ref) {
    return (
      <div
        ref={ref}
        className={[
          "bg-paper-deep rounded-brujula-lg shadow-card",
          "p-6",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

export default Card;
