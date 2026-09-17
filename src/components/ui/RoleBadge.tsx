import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

// RoleBadge (DESIGN.md `components.role-badge`): píldora en el tono
// `{colors.role-*}` correspondiente, siempre con texto blanco. Catalizador
// y Coach usan su variante `-deep` (`role-catalizador-deep`,
// `role-coach-deep`) en vez del tono base -- el base de ambos falla AA con
// texto blanco (DESIGN.md Colors); Visionario, Arquitecto y Plenitud usan
// su tono base, que sí cumple AA. Visible en las etiquetas del radar, las
// cabeceras de fila de la tabla de competencias y el resumen de menciones
// de mapa-de-competencias (EXPERIENCE.md Component Patterns), siempre
// emparejado con el nombre del rol como texto, nunca solo color.
//
// El valor numérico ("Catalizador · 4.6") es responsabilidad del caller:
// DESIGN.md lo muestra solo cuando el componente que rodea al badge no
// repite ya el número en otro sitio de la misma vista -- por eso `children`
// no tiene contenido por defecto aquí.
//
// Envoltorio puro sobre <span> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components.
export type Role = "visionario" | "arquitecto" | "catalizador" | "coach" | "plenitud";

interface RoleBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  role: Role;
}

const ROLE_FILL: Record<Role, string> = {
  visionario: "bg-role-visionario",
  arquitecto: "bg-role-arquitecto",
  catalizador: "bg-role-catalizador-deep",
  coach: "bg-role-coach-deep",
  plenitud: "bg-role-plenitud",
};

const RoleBadge = forwardRef<HTMLSpanElement, RoleBadgeProps>(
  function RoleBadge({ className = "", role, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={[
          ROLE_FILL[role] ?? "bg-role-visionario",
          "text-paper-deep rounded-full font-caption text-caption",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

export default RoleBadge;
