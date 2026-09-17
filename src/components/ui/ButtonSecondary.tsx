import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

// Botón secundario (DESIGN.md `components.button-secondary`): relleno
// transparente, borde `line`, texto `ink`, `rounded-brujula-lg`, sin
// elevación -- para que nunca compita visualmente con el único botón
// primario de la pantalla (spec-2-2-core-interactive-primitives.md).
//
// Envoltorio puro sobre <button> nativo: sin "use client" y sin imports de
// datos, para poder usarse también desde Server Components. El caller pasa
// onClick/type/aria-* etc. igual que con un <button> normal; `type` por
// defecto es "button" para no heredar el "submit" nativo dentro de un
// <form> (p. ej. un "Cancelar" secundario), mientras siga siendo
// sobreescribible.
//
// Igual que `buttonPrimaryClassName` en ButtonPrimary.tsx, se expone
// también el array de clases base como `buttonSecondaryClassName` para
// quien necesite el aspecto exacto de este botón sobre un elemento que no
// puede ser un <button> (p. ej. un <Link> de navegación -- un <button> no
// puede anidarse dentro del <a> que genera Link), en vez de copiar la
// cadena a mano.
const buttonSecondaryClasses = [
  "bg-transparent text-ink border border-line rounded-brujula-lg",
  "px-6 py-3",
  "hover:bg-surface-2",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
];

export const buttonSecondaryClassName = buttonSecondaryClasses.join(" ");

const ButtonSecondary = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function ButtonSecondary({ className = "", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={[...buttonSecondaryClasses, className].filter(Boolean).join(" ")}
        {...props}
      />
    );
  }
);

export default ButtonSecondary;
