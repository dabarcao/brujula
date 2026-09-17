"use client";

import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

// AnonymityBadge (DESIGN.md `components.anonymity-badge`): píldora
// `indigo-wash`/`indigo-deep`, glifo de candado + una línea de micro-copy
// ("Anónimo — nadie ve tu nombre"), anclada junto a cada input de feedback,
// no un banner de una sola vez (DESIGN.md Components, EXPERIENCE.md
// "Do use ... every feedback input, every time").
//
// `emphasized` (EXPERIENCE.md líneas 66-79, "Anonymity-badge emphasis" --
// el momento de envío del wizard, el flujo de Diego): cambia el fondo de
// `indigo-wash` a `coral-wash` *y* el glifo de candado a un check, siempre
// juntos -- "this is the product's single most trust-critical moment ...
// it does not get a color-only treatment". Un único condicional decide
// ambos (color + icono) para que nunca sea posible que uno cambie sin el
// otro. La transición usa `motion-safe:transition-colors` (el propio gate
// de `prefers-reduced-motion` de Tailwind): con movimiento reducido el
// cambio es instantáneo, con movimiento normal es suave -- el contenido
// (qué estado está activo) nunca depende de la animación.
//
// Único componente de este story con "use client": es el único cuyo
// `emphasized` necesita re-renderizar una transición controlada en el
// navegador; el prop en sí puede seguir siendo controlado por un padre
// Server o Client Component (spec-2-4-feedback-and-status-components.md).
//
// spec-4-4 post-review patch (fix #2, Edge Case Hunter): the color+icon
// swap above is a purely visual reconfirmation -- a screen-reader user
// got nothing announcing this exact "product's single most trust-critical
// moment" (EXPERIENCE.md). Fixed with a visually-hidden `role="status"`
// span, mounted only while `emphasized` is true: most screen readers
// announce a freshly-inserted `role="status"` node even without a
// live region already present beforehand, and it disappears again on its
// own once `emphasized` reverts (matching the "briefly emphasizes"
// behavior, never a persistent region). No new prop -- gated on the
// existing `emphasized` prop only, keeping this component's minimal-prop
// surface unchanged.
interface AnonymityBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  emphasized?: boolean;
  children?: ReactNode;
}

const DEFAULT_COPY = "Anónimo — nadie ve tu nombre";

const AnonymityBadge = forwardRef<HTMLSpanElement, AnonymityBadgeProps>(
  function AnonymityBadge({ className = "", emphasized = false, children, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={[
          "inline-flex items-center gap-2 rounded-full font-caption text-caption",
          "motion-safe:transition-colors",
          emphasized ? "bg-coral-wash text-coral-deep" : "bg-indigo-wash text-indigo-deep",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          {emphasized ? (
            <polyline points="4 12 9 17 20 6" />
          ) : (
            <>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </>
          )}
        </svg>
        {children || DEFAULT_COPY}
        {emphasized && (
          <span role="status" className="sr-only">
            Confirmado: tu respuesta sigue siendo anónima
          </span>
        )}
      </span>
    );
  }
);

export default AnonymityBadge;
