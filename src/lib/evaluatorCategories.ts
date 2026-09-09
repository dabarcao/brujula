// Compartido entre organizar evaluadores de un ciclo 360 por primera vez
// (cycles/[id]) y editarlos después (feedback/[id]) — mismas 4 categorías
// en los dos sitios.
export const EVALUATOR_CATEGORY_LABELS: Record<string, string> = {
  manager: "Jefe / responsable directo",
  team: "Compañero de equipo",
  organization: "Compañero de la empresa",
  other: "Otro",
};

// Vive aquí (módulo neutral, sin "use client") y no dentro de
// CompetencyComparisonChart — cruzar de un archivo "use client" a un
// Server Component para importar una simple constante no resuelve de
// forma fiable (se vio en pruebas reales con un componente que
// necesitaba estos colores desde el servidor: salían todos en gris).
//
// Un solo tono (violeta), de más oscuro a más claro — antes eran 4
// colores de familias distintas, que competían visualmente con los 5
// colores de GROUP_COLORS en el mismo gráfico.
export const EVALUATOR_CATEGORY_COLORS: Record<string, string> = {
  manager: "#4c1d95", // violeta más oscuro
  team: "#7c3aed",
  organization: "#a78bfa",
  other: "#ddd6fe", // violeta más claro
};
