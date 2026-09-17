import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// CardAccent (DESIGN.md `components.card-accent`): relleno `indigo` sólido,
// texto `paper-deep`, `rounded-brujula-lg`, `elevation.raised` -- reservado
// para las tarjetas "momento" de dashboard-home (un ciclo abierto, una
// invitación a responder). **Do** usar `CardAccent` solo ahí. **Don't**
// aplicarlo a pantallas admin/agregadas: una tarjeta indigo llena en una
// vista agregada se lee como el resultado de una sola persona, no de un
// grupo (DESIGN.md `## Do's and Don'ts`).
//
// Componente hermano de `Card`, deliberadamente separado -- nunca un
// `variant="accent"` de `Card` -- para que el import equivocado sea visible
// en la propia línea de import (spec-2-3-card-system.md).
//
// Envoltorio puro sobre <div> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
const CardAccent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardAccent({ className = "", ...props }, ref) {
    return (
      <div
        ref={ref}
        className={[
          "bg-indigo text-paper-deep rounded-brujula-lg shadow-raised",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

export default CardAccent;
