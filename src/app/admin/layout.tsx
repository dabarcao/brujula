import type { ReactNode } from "react";
import { CompassWatermark } from "@/components/ui/CompassBrand";

// Mismo tratamiento que src/app/dashboard/layout.tsx -- ver su comentario.
export default function AdminLayout({ children }: { children: ReactNode }) {
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
