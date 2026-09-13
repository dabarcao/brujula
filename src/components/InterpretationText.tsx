// Resalta en negrita cada mención de una competencia dentro del texto
// libre de la interpretación por IA, con su descripción real de la
// Biblioteca como tooltip al pasar el ratón por encima — mismo texto que
// ya usa /dashboard/biblioteca, ninguna definición nueva que mantener.
//
// Tooltip nativo (atributo title), no uno a medida en CSS: un tooltip con
// posición absoluta dentro de texto que fluye en párrafos es frágil (según
// en qué línea cae la palabra, puede no tener hueco arriba, abajo o a los
// lados) — se probó y se descartó por eso. El nativo pierde el estilo a
// medida, pero el navegador ya se encarga de que nunca se salga de la
// pantalla.

type CompetencyInfo = { name: string; description: string };

export default function InterpretationText({
  text,
  competencies,
}: {
  text: string;
  competencies: CompetencyInfo[];
}) {
  // Nombres más largos primero — evita que "Toma de decisiones" quede
  // parcialmente cubierto si otro nombre fuera subcadena suya (no es el
  // caso hoy, pero deja el orden a prueba de futuras competencias).
  const sorted = [...competencies].sort((a, b) => b.name.length - a.name.length);

  const paragraphs = text.split("\n").map((paragraph, pIndex) => {
    if (paragraph.trim() === "") return <br key={`br-${pIndex}`} />;

    // Un único regex con todos los nombres alternados, para partir el
    // párrafo respetando el orden en que aparecen — sin esto, resaltar
    // uno a uno reprocesaría el texto ya resaltado del anterior.
    const pattern = new RegExp(
      `(${sorted.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "g"
    );
    const segments = paragraph.split(pattern);

    return (
      <p key={pIndex}>
        {segments.map((segment, sIndex) => {
          const match = sorted.find((c) => c.name === segment);
          if (!match) return <span key={sIndex}>{segment}</span>;
          return (
            <strong
              key={sIndex}
              title={match.description}
              className="cursor-help underline decoration-dotted decoration-gray-400"
            >
              {segment}
            </strong>
          );
        })}
      </p>
    );
  });

  return <div className="flex flex-col gap-3">{paragraphs}</div>;
}
