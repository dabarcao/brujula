"use client";

import { useState } from "react";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";
import { buttonSecondaryClassName } from "@/components/ui/ButtonSecondary";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailEvaluatorPicker({
  fieldName,
  minEmails,
  categoryOptions,
  categoryDefaultValue,
  categoryDefaultsByEmail,
  defaultEmails = [],
  canModifyExisting = true,
  submitLabel = "Enviar solicitud",
  primary = false,
}: {
  fieldName: string;
  minEmails: number;
  // Igual que en EvaluatorPicker: si se pasa, cada email añadido lleva
  // también un <select> de categoría (jefe/equipo/empresa/otro).
  categoryOptions?: Record<string, string>;
  categoryDefaultValue?: string;
  // Categoría ya guardada por email (al editar ya existentes).
  categoryDefaultsByEmail?: Record<string, string>;
  // Emails ya invitados al cargar (editar una solicitud existente).
  defaultEmails?: string[];
  // false cuando ya hay respuestas: los que ya estaban invitados no se
  // pueden quitar ni cambiar de categoría, solo se puede seguir
  // añadiendo — los recién añadidos en esta misma sesión sí se pueden
  // quitar antes de guardar (todavía no se han enviado).
  canModifyExisting?: boolean;
  submitLabel?: string;
  primary?: boolean;
}) {
  const [emails, setEmails] = useState<string[]>(defaultEmails);
  const [existingEmails] = useState<Set<string>>(new Set(defaultEmails));
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addEmail = () => {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setFormError(`"${value}" no parece un email válido.`);
      return;
    }
    if (emails.includes(value)) {
      setFormError("Ese email ya está en la lista.");
      return;
    }
    setEmails((prev) => [...prev, value]);
    setDraft("");
    setFormError(null);
  };

  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium text-ink-soft mb-2">
          Emails añadidos ({emails.length} / mínimo {minEmails})
        </p>
        {emails.length === 0 ? (
          <p className="text-sm text-ink-soft border border-line rounded-brujula-sm px-4 py-3">
            Todavía no has añadido ningún email.
          </p>
        ) : (
          <table className="w-full text-sm border border-line rounded-brujula-sm overflow-hidden">
            <tbody className="divide-y divide-line">
              {emails.map((email) => {
                const locked = !canModifyExisting && existingEmails.has(email);
                const savedCategory = categoryDefaultsByEmail?.[email] ?? categoryDefaultValue;
                return (
                  <tr key={email}>
                    <td className="px-4 py-2 text-ink break-words">
                      <input type="hidden" name={fieldName} value={email} />
                      {email}
                    </td>
                    {categoryOptions && (
                      <td className="px-4 py-2 w-48">
                        {locked ? (
                          <>
                            <span className="text-ink-soft text-xs">
                              {categoryOptions[savedCategory ?? ""] ?? savedCategory}
                            </span>
                            <input
                              type="hidden"
                              name={`category_${email}`}
                              value={savedCategory ?? ""}
                            />
                          </>
                        ) : (
                          <select
                            name={`category_${email}`}
                            defaultValue={savedCategory}
                            className="border border-line rounded-brujula-sm px-2 py-1 text-xs w-full bg-paper-deep text-ink"
                          >
                            {Object.entries(categoryOptions).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right w-20">
                      {locked ? (
                        <span className="text-xs text-ink-soft">Ya invitado</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          className="text-xs underline text-ink-soft hover:text-ink"
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setFormError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="email@ejemplo.com"
          className="border border-line rounded-brujula-sm px-3 py-2 text-sm flex-1 bg-paper-deep text-ink"
        />
        <button
          type="button"
          onClick={addEmail}
          className="bg-transparent text-ink border border-line rounded-brujula-lg hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo text-sm px-4 py-2"
        >
          Añadir
        </button>
      </div>
      {formError && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink border border-line rounded-brujula-sm bg-surface-2 px-3 py-2">
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
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12.5" />
            <line x1="12" y1="15.5" x2="12" y2="15.51" />
          </svg>
          {formError}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={emails.length < minEmails}
          className={`${primary ? buttonPrimaryClassName : buttonSecondaryClassName} text-sm`}
        >
          {submitLabel}
        </button>
        {emails.length < minEmails && (
          <p className="text-xs text-ink-soft mt-2">
            Añade {minEmails - emails.length} más para poder enviar.
          </p>
        )}
      </div>
    </div>
  );
}
