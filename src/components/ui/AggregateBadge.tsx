import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// AggregateBadge (DESIGN.md `components.aggregate-badge`): pill pequeño
// `surface-2` / `ink-soft`, `rounded-full`, tipografía `caption` -- la
// señal visual de que una vista es un rollup ("Vista agregada — [N]
// personas"), nunca el dato de una persona. Deliberadamente el único badge
// del sistema fuera de la paleta indigo/coral (UX-DR35), para que se lea
// como estructuralmente distinto a simple vista.
//
// El contenido (children) es genérico -- no hay un formato de conteo
// harcodeado -- el caller compone el texto exacto, p. ej.
// `<AggregateBadge>Vista agregada — 12 personas</AggregateBadge>`
// (spec-2-3-card-system.md).
//
// Envoltorio puro sobre <span> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
const AggregateBadge = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function AggregateBadge({ className = "", ...props }, ref) {
    return (
      <span
        ref={ref}
        className={[
          "bg-surface-2 text-ink-soft rounded-full font-caption text-caption",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

export default AggregateBadge;
