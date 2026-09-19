// Versión PDF de src/components/InterpretationText.tsx -- mismo
// markdown-lite (negrita en menciones de competencia, "# título" tratado
// como negrita), sin el tooltip (no aplica en un documento estático).

import { Text, StyleSheet } from "@react-pdf/renderer";
import { View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  wrap: { display: "flex", flexDirection: "column", gap: 6 },
  paragraph: { fontSize: 10, color: "#1C2033", lineHeight: 1.5 },
  bold: { fontWeight: 700 },
});

export function PdfInterpretationBlock({
  text,
  competencies,
}: {
  text: string;
  competencies: { name: string; description: string }[];
}) {
  const sorted = [...competencies].sort((a, b) => b.name.length - a.name.length);
  const paragraphs = text.split("\n").filter((p) => p.trim() !== "");

  return (
    <View style={styles.wrap} wrap={false}>
      {paragraphs.map((paragraph, pIndex) => {
        const headingMatch = paragraph.match(/^#+\s*(.+)$/);
        if (headingMatch) {
          return (
            <Text key={pIndex} style={[styles.paragraph, styles.bold]}>
              {headingMatch[1]}
            </Text>
          );
        }

        if (sorted.length === 0) {
          return (
            <Text key={pIndex} style={styles.paragraph}>
              {paragraph}
            </Text>
          );
        }

        const pattern = new RegExp(
          `(${sorted.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
          "g"
        );
        const segments = paragraph.split(pattern);

        return (
          <Text key={pIndex} style={styles.paragraph}>
            {segments.map((segment, sIndex) => {
              const match = sorted.find((c) => c.name === segment);
              return (
                <Text key={sIndex} style={match ? styles.bold : undefined}>
                  {segment}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
}
