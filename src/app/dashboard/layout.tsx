import type { ReactNode } from "react";
import { CompassWatermark } from "@/components/ui/CompassBrand";

// EXPERIMENTO LOCAL (2026-09-17, no subido a producción todavía): la
// misma marca de agua de /login, pero mucho más tenue -- ese 0.07 se lee
// bien ahí porque el fondo propio de login (degradado + viñeta en las
// esquinas) ya la camufla; sobre el fondo plano del dashboard, el mismo
// valor se veía "súper sólida". `position: fixed` para que se quede
// anclada a la esquina de la pantalla aunque la página tenga scroll (a
// diferencia de `absolute`, que se ancla al contenedor y en una página
// larga acabaría mucho más abajo del borde visible).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex-1 flex flex-col">
      <CompassWatermark
        opacity={0.025}
        className="fixed pointer-events-none select-none right-[-32%] bottom-[-28%] w-[170vw] max-w-none sm:w-[1500px] aspect-square -z-10"
      />
      {children}
    </div>
  );
}
