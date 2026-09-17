import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

// Botón primario (DESIGN.md `components.button-primary`): relleno indigo,
// `rounded-brujula-lg`, `shadow-raised` y etiqueta con la tipografía de
// encabezado. Cada pantalla tiene como máximo una acción visualmente
// primaria; esta es esa acción (spec-2-2-core-interactive-primitives.md).
//
// Texto en `--ink` (oscuro), no `paper-deep` (blanco): tras el rebrand a
// los colores corporativos de Kairos (2026-09-18), `--indigo` resuelve a
// verde claro rgb(140,180,60) -- con texto blanco encima el contraste no
// llega al mínimo AA (~2.4:1, comprobado). Oscuro sobre ese verde sí pasa
// cómodo (~6.7:1).
//
// Envoltorio puro sobre <button> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components. El caller pasa
// onClick/type/aria-* etc. igual que con un <button> normal; `type` por
// defecto es "button" para no heredar el "submit" nativo dentro de un
// <form>, mientras siga siendo sobreescribible.
//
// Array base sin el slot de `className` del caller -- se expone también
// como `buttonPrimaryClassName` para quien necesite el aspecto exacto de
// este botón sobre un elemento que no puede ser un <button> (p. ej. un
// <Link> de navegación: un <button> no puede anidarse dentro del <a> que
// genera Link), en vez de copiar la cadena a mano y arriesgarse a que
// diverja si este componente cambia.
const buttonPrimaryClasses = [
  "bg-indigo text-ink font-heading rounded-brujula-lg shadow-raised",
  "px-6 py-3",
  "hover:brightness-95",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  // outline-ink, no outline-paper-deep: un anillo blanco sobre fondo verde
  // claro no llega al 3:1 de contraste que pide un indicador de foco.
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
];

export const buttonPrimaryClassName = buttonPrimaryClasses.join(" ");

const ButtonPrimary = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function ButtonPrimary({ className = "", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={[...buttonPrimaryClasses, className].filter(Boolean).join(" ")}
        {...props}
      />
    );
  }
);

export default ButtonPrimary;
