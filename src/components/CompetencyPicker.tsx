"use client";

import { useState } from "react";

type CompetencyOption = {
  code: string;
  name: string;
};

export default function CompetencyPicker({
  questionId,
  competencies,
  maxSelections,
}: {
  questionId: string;
  competencies: CompetencyOption[];
  maxSelections: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(code: string) {
    setSelected((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= maxSelections) {
        return prev;
      }
      return [...prev, code];
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Elige {maxSelections === 1 ? "una competencia" : `hasta ${maxSelections} competencias`}.
      </p>
      <div className="flex flex-wrap gap-2">
        {competencies.map((competency) => {
          const isSelected = selected.includes(competency.code);
          const disabled = !isSelected && selected.length >= maxSelections;
          return (
            <label
              key={competency.code}
              className={
                "text-xs border rounded-full px-3 py-1 cursor-pointer " +
                (isSelected
                  ? "bg-black text-white border-black"
                  : disabled
                  ? "text-gray-300 border-gray-200 cursor-not-allowed"
                  : "text-gray-700 border-gray-300")
              }
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                disabled={disabled}
                onChange={() => toggle(competency.code)}
              />
              {competency.name}
            </label>
          );
        })}
      </div>

      {selected.map((code) => {
        const competency = competencies.find((c) => c.code === code);
        return (
          <div key={code} className="border rounded p-3 flex flex-col gap-2">
            <input type="hidden" name={`competency_${questionId}`} value={code} />
            <p className="text-sm font-medium">{competency?.name}</p>
            <div className="flex gap-2">
              {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((level) => (
                <label key={level} className="flex flex-col items-center gap-1 text-xs text-gray-600">
                  <input
                    type="radio"
                    name={`competency_value_${questionId}_${code}`}
                    value={level}
                    required
                  />
                  {level}
                </label>
              ))}
            </div>
            <textarea
              name={`competency_text_${questionId}_${code}`}
              rows={2}
              placeholder="Comentario sobre esta competencia..."
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
        );
      })}
    </div>
  );
}
