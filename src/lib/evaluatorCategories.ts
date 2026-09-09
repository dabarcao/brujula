// Compartido entre organizar evaluadores de un ciclo 360 por primera vez
// (cycles/[id]) y editarlos después (feedback/[id]) — mismas 4 categorías
// en los dos sitios.
export const EVALUATOR_CATEGORY_LABELS: Record<string, string> = {
  manager: "Jefe / responsable directo",
  team: "Compañero de equipo",
  organization: "Compañero de la empresa",
  other: "Otro",
};

// Vive aquí (módulo neutral, sin "use client") en vez de en
// CompetencyComparisonChart, porque CompetencyBars — un Server
// Component — también necesita importarla, y cruzar de un archivo
// "use client" a un Server Component para una simple constante no
// resuelve de forma fiable (se vio en pruebas reales: los puntos de
// grupo salían todos en gris, el color nunca llegaba).
export const EVALUATOR_CATEGORY_COLORS: Record<string, string> = {
  manager: "#7c3aed",
  team: "#0891b2",
  organization: "#ca8a04",
  other: "#db2777",
};
