"use client";

import { useState } from "react";

type ScaleLevel = {
  level: number;
  label: string;
};

// Barra de 1 a 5 en pasos de 0,5, con las 5 palabras de referencia
// repartidas debajo (rating_scale_levels) para saber más o menos a qué
// corresponde un valor intermedio como 3,5, sin perder la precisión de
// medio punto.
//
// A diferencia de un grupo de radios, un <input type="range"> siempre
// tiene algún valor — si no se toca, se colaría un "3" en el envío sin
// que nadie lo haya elegido de verdad. Por eso el valor real que se
// manda en el formulario (el input oculto) se queda vacío hasta el
// primer toque, aunque la barra ya se vea en su posición central.
export default function ScaleSlider({
  name,
  levels,
}: {
  name: string;
  levels: ScaleLevel[];
}) {
  const [touched, setTouched] = useState(false);
  const [value, setValue] = useState(3);

  const sortedLevels = [...levels].sort((a, b) => a.level - b.level);

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <input type="hidden" name={name} value={touched ? value : ""} />
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
            setTouched(true);
          }}
          className="flex-1 accent-black"
        />
        <span
          className={
            "text-sm font-medium w-8 text-right tabular-nums " +
            (touched ? "text-gray-900" : "text-gray-300")
          }
        >
          {touched ? value : "—"}
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
        {sortedLevels.map((level) => (
          <span key={level.level}>{level.label}</span>
        ))}
      </div>
      {!touched && <p className="text-[10px] text-gray-400">Desliza para elegir un valor.</p>}
    </div>
  );
}
