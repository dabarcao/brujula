import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

// Botón de revelado (DESIGN.md `components.reveal-button`): relleno
// `coral-deep` -- nunca el `coral` base, que no cumple contraste AA con
// texto blanco -- forma de píldora (`rounded-full`), `shadow-floating` y
// glifo de brújula (DESIGN.md: "paired with a small compass-glyph icon"),
// en `currentColor` para heredar el texto blanco del botón.
// Reservado en exclusiva para "mostrar mis resultados"
// (spec-2-2-core-interactive-primitives.md).
//
// Envoltorio puro sobre <button> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components. El caller pasa
// onClick/type/aria-* etc. igual que con un <button> normal; `type` por
// defecto es "button" para no heredar el "submit" nativo dentro de un
// <form>, mientras siga siendo sobreescribible.
const RevealButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function RevealButton({ className = "", type = "button", children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={[
          "bg-coral-deep text-paper-deep rounded-full shadow-floating",
          "inline-flex items-center gap-2 px-6 py-3",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-deep",
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
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M14.5 9.5 10 10l-.5 4.5 4.5-.5.5-4.5z" fill="currentColor" stroke="none" />
        </svg>
        {children}
      </button>
    );
  }
);

export default RevealButton;
