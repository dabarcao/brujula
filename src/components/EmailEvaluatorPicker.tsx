"use client";

import { useState } from "react";

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
        <p className="text-xs font-medium text-gray-500 mb-2">
          Emails añadidos ({emails.length} / mínimo {minEmails})
        </p>
        {emails.length === 0 ? (
          <p className="text-sm text-gray-400 border rounded px-4 py-3">
            Todavía no has añadido ningún email.
          </p>
        ) : (
          <table className="w-full text-sm border rounded overflow-hidden">
            <tbody className="divide-y">
              {emails.map((email) => {
                const locked = !canModifyExisting && existingEmails.has(email);
                const savedCategory = categoryDefaultsByEmail?.[email] ?? categoryDefaultValue;
                return (
                  <tr key={email}>
                    <td className="px-4 py-2">
                      <input type="hidden" name={fieldName} value={email} />
                      {email}
                    </td>
                    {categoryOptions && (
                      <td className="px-4 py-2 w-48">
                        {locked ? (
                          <>
                            <span className="text-gray-500 text-xs">
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
                            className="border rounded px-2 py-1 text-xs w-full"
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
                        <span className="text-xs text-gray-300">Ya invitado</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          className="text-xs underline text-red-700"
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
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        <button
          type="button"
          onClick={addEmail}
          className="border rounded px-4 py-2 text-sm hover:bg-gray-50"
        >
          Añadir
        </button>
      </div>
      {formError && <p className="text-xs text-red-700">{formError}</p>}

      <div>
        <button
          type="submit"
          disabled={emails.length < minEmails}
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
        {emails.length < minEmails && (
          <p className="text-xs text-gray-400 mt-2">
            Añade {minEmails - emails.length} más para poder enviar.
          </p>
        )}
      </div>
    </div>
  );
}
