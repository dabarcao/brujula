"use client";

import { useState } from "react";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

export default function EvaluatorPicker({
  colleagues,
  checkboxName,
  defaultCheckedIds = [],
  categoryOptions,
  categoryDefaultValue,
  categoryDefaultsById,
  minSelected = 1,
  submitLabel = "Guardar cambios",
  primary = false,
  canModifyExisting = true,
}: {
  colleagues: ColleagueRow[];
  checkboxName: string;
  defaultCheckedIds?: string[];
  // Datos, no una función: un Server Component no puede pasar funciones
  // (como un renderExtra) a un Client Component, no son serializables a
  // través de esa frontera. Si se necesita un <select> de categoría junto
  // a cada evaluador, se declara aquí como datos y el propio componente
  // lo renderiza.
  categoryOptions?: Record<string, string>;
  categoryDefaultValue?: string;
  // Categoría ya guardada por persona (al editar evaluadores ya
  // existentes, cada uno puede tener una distinta) — si no aparece aquí,
  // cae en categoryDefaultValue (caso de gente recién añadida).
  categoryDefaultsById?: Record<string, string>;
  // El botón de enviar vive aquí dentro (no en la página que lo usa) para
  // poder desactivarlo mientras no se llegue al mínimo — así una solicitud
  // enviada de más no manda al usuario a una redirección de error que le
  // borra todo lo que ya había elegido.
  minSelected?: number;
  submitLabel?: string;
  primary?: boolean;
  // false cuando ya hay respuestas: los que ya estaban invitados no se
  // pueden quitar ni cambiar de categoría, solo se puede seguir
  // añadiendo — los recién añadidos en esta misma sesión sí se pueden
  // quitar antes de guardar (todavía no se han enviado).
  canModifyExisting?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultCheckedIds);
  const [existingIds] = useState<Set<string>>(new Set(defaultCheckedIds));

  const selectedSet = new Set(selectedIds);
  const byId = new Map(colleagues.map((c) => [c.id, c]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((c): c is ColleagueRow => Boolean(c));
  const rest = colleagues.filter((c) => !selectedSet.has(c.id));

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRest = normalizedQuery
    ? rest.filter((colleague) =>
        `${colleague.full_name ?? ""} ${colleague.email}`.toLowerCase().includes(normalizedQuery)
      )
    : rest;

  const removeId = (id: string) => setSelectedIds((prev) => prev.filter((x) => x !== id));
  const addId = (id: string) => setSelectedIds((prev) => [...prev, id]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">
          Ya elegidos ({selected.length})
        </p>
        {selected.length === 0 ? (
          <p className="text-sm text-gray-400 border rounded px-4 py-3">
            Todavía no has elegido a nadie — búscalos abajo.
          </p>
        ) : (
          <table className="w-full text-sm border rounded overflow-hidden">
            <tbody className="divide-y">
              {selected.map((colleague) => {
                const locked = !canModifyExisting && existingIds.has(colleague.id);
                const savedCategory = categoryDefaultsById?.[colleague.id] ?? categoryDefaultValue;
                return (
                  <tr key={colleague.id}>
                    <td className="px-4 py-2">
                      <input type="hidden" name={checkboxName} value={colleague.id} />
                      <span className="font-medium">{colleague.full_name || colleague.email}</span>
                      {colleague.full_name && (
                        <span className="text-gray-500"> · {colleague.email}</span>
                      )}
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
                              name={`category_${colleague.id}`}
                              value={savedCategory ?? ""}
                            />
                          </>
                        ) : (
                          <select
                            name={`category_${colleague.id}`}
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
                          onClick={() => removeId(colleague.id)}
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

      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Añadir más</p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o email..."
          className="border rounded px-3 py-2 text-sm w-full mb-2"
        />
        <ul className="border rounded divide-y max-h-64 overflow-y-auto">
          {filteredRest.map((colleague) => (
            <li
              key={colleague.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span>
                <span className="font-medium">{colleague.full_name || colleague.email}</span>
                {colleague.full_name && (
                  <span className="text-gray-500"> · {colleague.email}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => addId(colleague.id)}
                className="text-xs underline text-gray-700 shrink-0"
              >
                Añadir
              </button>
            </li>
          ))}
          {filteredRest.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">Sin coincidencias.</li>
          )}
        </ul>
      </div>

      <div>
        <button
          type="submit"
          disabled={selected.length < minSelected}
          className={
            primary
              ? "bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
              : "border rounded px-4 py-2 text-sm hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          }
        >
          {submitLabel}
        </button>
        {selected.length < minSelected && (
          <p className="text-xs text-gray-400 mt-2">
            {minSelected === 1
              ? "Elige al menos a una persona para poder enviar."
              : `Elige ${minSelected - selected.length} más para poder enviar.`}
          </p>
        )}
      </div>
    </div>
  );
}
