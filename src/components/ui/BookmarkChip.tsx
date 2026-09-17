import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// BookmarkChip (DESIGN.md `components.bookmark-chip`): píldora
// `{colors.coral-wash}` con texto `{colors.coral-deep}` -- el par
// específico que DESIGN.md señala como el que hace legible el chip en AA
// (Colors) -- la afordancia de pausa/reanudación del wizard, mostrada
// como un marcapáginas y nunca como una advertencia de "progreso perdido"
// (EXPERIENCE.md Voice and Tone, State Patterns "Saved/paused").
//
// `{rounded.full}`: tanto la prosa de `## Components` ("a coral-wash pill
// with coral-deep text") como `## Shapes` ("rounded.full is pills only ...
// the bookmark/pause affordance") listan este chip como píldora; se sigue
// esa prosa -- citada dos veces -- sobre la entrada aislada
// `bookmark-chip.radius: '{rounded.sm}'` del frontmatter de DESIGN.md, que
// se lee como una inconsistencia con el resto del propio documento (ver
// spec-2-4-feedback-and-status-components.md, Implementation Notes).
//
// Contenido por `children`, sin copy por defecto -- igual que
// AggregateBadge (Story 2.3) -- el caller compone el texto exacto de
// EXPERIENCE.md: "Guardado — continúa cuando quieras".
//
// Envoltorio puro sobre <span> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
const BookmarkChip = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function BookmarkChip({ className = "", ...props }, ref) {
    return (
      <span
        ref={ref}
        className={[
          "bg-coral-wash text-coral-deep rounded-full font-caption text-caption",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

export default BookmarkChip;
