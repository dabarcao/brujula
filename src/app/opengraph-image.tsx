import { ImageResponse } from "next/og";
import { buildNeedleDots } from "@/components/ui/CompassBrand";

// Imagen de vista previa al compartir el enlace (WhatsApp, etc.) -- antes
// no existía ninguna, así que WhatsApp usaba favicon.ico (el icono por
// defecto del scaffolding inicial, nunca personalizado) como mejor imagen
// disponible. Reusa el mismo logo que ya vive encima de "Inicia sesión en
// Brújula" (CompassBadge en src/components/ui/CompassBrand.tsx) -- el
// usuario, explícito: "el logo el que hemos puesto, pero no el del tapiz
// sino el que está encima de la página de login". `next/og`'s
// ImageResponse (Satori) no puede leer custom properties de CSS -- mismos
// verdes en hex literal que el resto de CompassBrand.tsx.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const dots = buildNeedleDots(32, 32, 11, 25, 3, 0.9);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F6F7F1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          <div
            style={{
              display: "flex",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "#EEF3E0",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="150" height="150" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="27" fill="none" stroke="#8CB43C" strokeWidth="2.4" />
              <line x1="32" y1="7" x2="32" y2="10.5" stroke="#145F37" strokeWidth="1.6" />
              <line x1="32" y1="53.5" x2="32" y2="57" stroke="#145F37" strokeWidth="1.6" />
              <line x1="7" y1="32" x2="10.5" y2="32" stroke="#145F37" strokeWidth="1.6" />
              <line x1="53.5" y1="32" x2="57" y2="32" stroke="#145F37" strokeWidth="1.6" />
              {dots.map((d, i) => (
                <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
              ))}
              <circle cx="32" cy="32" r="2.2" fill="#F6F7F1" stroke="#145F37" strokeWidth="1" />
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 96, fontWeight: 700, color: "#1C2033" }}>Brújula</div>
            <div style={{ fontSize: 34, color: "#5B6259" }}>
              Encuentra tu rumbo, con feedback seguro.
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
