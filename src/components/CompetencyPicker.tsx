"use client";

import { useState } from "react";
import ScaleSlider from "@/components/ScaleSlider";

type CompetencyOption = {
  code: string;
  name: string;
};

type ScaleLevel = {
  level: number;
  label: string;
};

type CompetencyDraftEntry = {
  code: string;
  value: number | null;
  text: string;
};

// `defaultEntries` (spec-4-4-responder-invitation-screens-redesign.md):
// same one-time-remount seed pattern as ScaleSlider's own `defaultValue` --
// ResponderWizard's localStorage draft restore passes back which
// competencies were already selected, and each one's slider value/comment,
// via a `key` change on this component so it mounts once with the right
// initial state and behaves exactly as before afterwards.
export default function CompetencyPicker({
  questionId,
  competencies,
  maxSelections,
  scaleLevels,
  defaultEntries,
}: {
  questionId: string;
  competencies: CompetencyOption[];
  maxSelections: number;
  scaleLevels: ScaleLevel[];
  defaultEntries?: CompetencyDraftEntry[];
}) {
  const [selected, setSelected] = useState<string[]>(
    () => defaultEntries?.map((e) => e.code) ?? []
  );
  const defaultEntryByCode = new Map((defaultEntries ?? []).map((e) => [e.code, e]));

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
        const draftEntry = defaultEntryByCode.get(code);
        return (
          <div key={code} className="border rounded p-3 flex flex-col gap-2">
            <input type="hidden" name={`competency_${questionId}`} value={code} />
            <p className="text-sm font-medium">{competency?.name}</p>
            <ScaleSlider
              name={`competency_value_${questionId}_${code}`}
              levels={scaleLevels}
              defaultValue={draftEntry?.value ?? undefined}
            />
            <textarea
              name={`competency_text_${questionId}_${code}`}
              rows={2}
              placeholder="Comentario sobre esta competencia..."
              defaultValue={draftEntry?.text ?? undefined}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
        );
      })}
    </div>
  );
}
