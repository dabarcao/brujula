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
  renderExtra,
}: {
  colleagues: ColleagueRow[];
  checkboxName: string;
  defaultCheckedIds?: string[];
  renderExtra?: (colleague: ColleagueRow) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? colleagues.filter((colleague) =>
        `${colleague.full_name ?? ""} ${colleague.email}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : colleagues;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o email..."
        className="border rounded px-3 py-2 text-sm"
      />
      <ul className="border rounded divide-y">
        {filtered.map((colleague) => (
          <li key={colleague.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <input
              type="checkbox"
              name={checkboxName}
              value={colleague.id}
              id={`${checkboxName}-${colleague.id}`}
              defaultChecked={defaultCheckedIds.includes(colleague.id)}
            />
            <label htmlFor={`${checkboxName}-${colleague.id}`} className="flex-1">
              <span className="font-medium">{colleague.full_name || colleague.email}</span>
              {colleague.full_name && (
                <span className="text-gray-500"> · {colleague.email}</span>
              )}
            </label>
            {renderExtra?.(colleague)}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">Sin coincidencias.</li>
        )}
      </ul>
    </div>
  );
}
