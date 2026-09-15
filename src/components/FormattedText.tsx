// Parseo de texto libre editable desde la BBDD (platform_texts,
// competency_frameworks, competency_principles, competency_roles...) con
// **negrita** al estilo markdown — la única marca que se entiende, nunca
// se interpreta como HTML. Lo que no encaje con el patrón se muestra tal
// cual como texto plano, así una edición futura mal escrita como mucho no
// añade el énfasis que pretendía, pero nunca puede romper la página ni
// inyectar nada. Compartido entre Onboarding360Wizard (el asistente del
// 360) y CompetencyModelDiagram (la Biblioteca) para no duplicar este
// parseo en cada sitio que muestra texto editable.

function parseInline(text: string) {
  return text.split(/(\*\*.+?\*\*)/g).map((segment, index) =>
    segment.startsWith("**") && segment.endsWith("**") ? (
      <strong key={index}>{segment.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{segment}</span>
    )
  );
}

// Para texto que ya vive dentro de un <p> propio (p. ej. junto a una
// etiqueta como "Valor alto: ") — sin partir en párrafos.
export function FormattedInline({ text }: { text: string }) {
  return <>{parseInline(text)}</>;
}

// Para un bloque de texto completo, con párrafos separados por una línea
// en blanco — cada uno se convierte en su propio <p>.
export function FormattedParagraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => {
          // Un "# título" markdown por error se trata como negrita, no
          // como almohadilla suelta — mismo criterio que InterpretationText.
          const headingMatch = paragraph.match(/^#+\s*(.+)$/);
          if (headingMatch) {
            return (
              <p key={index}>
                <strong>{headingMatch[1]}</strong>
              </p>
            );
          }
          return <p key={index}>{parseInline(paragraph)}</p>;
        })}
    </>
  );
}
