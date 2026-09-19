// Documento PDF del informe 360 individual (docs/spec.md sección 17,
// diseño cerrado 2026-09-17, tono "Humanista Brújula" elegido 2026-09-19).
// Cada sección es su propia <Page> -- si el contenido no cabe, react-pdf
// continúa automáticamente en una página nueva del mismo tamaño, repitiendo
// la cabecera `fixed` -- nunca corta una sección a mitad de la anterior
// (a diferencia de "imprimir desde el navegador", que no pagina de
// verdad). Cada fila/bloque atómico (una fila de tabla, una barra de
// saboteador, una respuesta de una pregunta) lleva wrap={false} para que
// ESE bloque en concreto nunca se parta a mitad, sin impedir que la
// sección entera fluya a una página siguiente.

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfCompassBadge, PdfWatermark } from "./brand";
import { PdfCompetencyChart, type PdfChartAxis, type PdfChartCategorySeries } from "./radarChart";
import { PdfInterpretationBlock } from "./interpretationBlock";

const INK = "#1C2033";
const INK_SOFT = "#5B5F7A";
const PAPER = "#F7F4EE";
const LINE = "#E4DFD3";
const INDIGO_WASH = "#EEF3E0";
const SABOTEADOR_TINT = "#B56A4C";
const SABOTEADOR_WASH = "#F7E6DE";

const SABOTEADOR_LABELS: Record<string, string> = {
  controlador: "Controlador",
  evitador: "Evitador",
  hiperracional: "Hiperracional",
  complaciente: "Complaciente",
  perfeccionista: "Perfeccionista",
};

const styles = StyleSheet.create({
  cover: {
    padding: 0,
    backgroundColor: PAPER,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  coverWatermark: { position: "absolute", bottom: -90, right: -90 },
  coverBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: INDIGO_WASH,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  coverTitle: { fontSize: 26, fontWeight: 700, color: INK, textAlign: "center", marginBottom: 8 },
  coverSubtitle: { fontSize: 12, color: INK_SOFT, textAlign: "center", marginBottom: 4 },
  coverDate: { fontSize: 10, color: INK_SOFT, textAlign: "center", marginBottom: 40 },
  coverTagline: {
    position: "absolute",
    bottom: 48,
    fontSize: 10,
    color: INK_SOFT,
    textAlign: "center",
    width: "100%",
  },
  page: { padding: 48, paddingTop: 64, backgroundColor: PAPER },
  header: {
    position: "absolute",
    top: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingBottom: 8,
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerBrandText: { fontSize: 9, color: INK_SOFT, fontWeight: 700 },
  headerName: { fontSize: 9, color: INK_SOFT },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: INK_SOFT,
    textAlign: "center",
  },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 },
  sectionSubtitle: { fontSize: 9, color: INK_SOFT, marginBottom: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  cardLabel: { fontSize: 8, fontWeight: 700, color: INK_SOFT, marginBottom: 6 },
  questionBlock: { marginBottom: 14 },
  questionPrompt: { fontSize: 11, fontWeight: 700, color: INK, marginBottom: 6 },
  answer: {
    fontSize: 9.5,
    color: INK_SOFT,
    lineHeight: 1.5,
    marginBottom: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: LINE,
  },
  saboteadorRow: { marginBottom: 10 },
  saboteadorLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  saboteadorName: { fontSize: 10, fontWeight: 700 },
  saboteadorValue: { fontSize: 9, color: INK_SOFT },
  saboteadorTrack: { height: 5, borderRadius: 3, backgroundColor: SABOTEADOR_WASH, overflow: "hidden" },
  saboteadorFill: { height: 5, borderRadius: 3 },
  saboteadorCaption: { fontSize: 8, color: INK_SOFT, marginBottom: 10 },
});

function PageHeader({ personName }: { personName: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerBrand}>
        <PdfCompassBadge size={16} />
        <Text style={styles.headerBrandText}>Brújula</Text>
      </View>
      <Text style={styles.headerName}>El feedback de {personName}</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <Text
      style={styles.footer}
      fixed
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
    />
  );
}

export type Individual360PdfData = {
  personName: string;
  requestLabel: string;
  closedAtLabel: string | null;
  interpretation: {
    competencias: string | null;
    saboteadores: string | null;
    resumenAbiertas: string | null;
  } | null;
  competencyDescriptions: { name: string; description: string }[];
  axes: PdfChartAxis[];
  categorySeries: PdfChartCategorySeries[];
  saboteadores: { saboteadorCode: string; avgValue: number; isHigh: boolean }[];
  openQuestions: { prompt: string; answers: string[] }[];
};

export function Individual360Document({ data }: { data: Individual360PdfData }) {
  const {
    personName,
    requestLabel,
    closedAtLabel,
    interpretation,
    competencyDescriptions,
    axes,
    categorySeries,
    saboteadores,
    openQuestions,
  } = data;

  const sortedSaboteadores = [...saboteadores].sort((a, b) => b.avgValue - a.avgValue);
  const hasSaboteadoresSection = interpretation?.saboteadores || sortedSaboteadores.length > 0;
  const hasOpenSection = interpretation?.resumenAbiertas || openQuestions.length > 0;

  return (
    <Document title={`Informe 360 · ${personName}`} author="Brújula">
      <Page size="A4" style={styles.cover}>
        <View style={styles.coverWatermark}>
          <PdfWatermark size={380} opacity={0.06} />
        </View>
        <View style={styles.coverBadge}>
          <PdfCompassBadge size={64} />
        </View>
        <Text style={styles.coverTitle}>El feedback de {personName}</Text>
        <Text style={styles.coverSubtitle}>{requestLabel}</Text>
        {closedAtLabel && <Text style={styles.coverDate}>Cerrado el {closedAtLabel}</Text>}
        <Text style={styles.coverTagline}>Encuentra tu rumbo, con feedback seguro.</Text>
      </Page>

      {interpretation?.competencias && (
        <Page size="A4" style={styles.page}>
          <PageHeader personName={personName} />
          <Text style={styles.sectionTitle}>Interpretación de tu perfil</Text>
          <Text style={styles.sectionSubtitle}>Generado por IA a partir de tus datos de competencias.</Text>
          <PdfInterpretationBlock text={interpretation.competencias} competencies={competencyDescriptions} />
          <PageFooter />
        </Page>
      )}

      <Page size="A4" style={styles.page}>
        <PageHeader personName={personName} />
        <Text style={styles.sectionTitle}>Comparativa por competencias</Text>
        <Text style={styles.sectionSubtitle}>
          Tu autoevaluación frente a la media de tus compañeros, por competencia.
        </Text>
        <PdfCompetencyChart axes={axes} categorySeries={categorySeries} size={300} />
        <PageFooter />
      </Page>

      {hasSaboteadoresSection && (
        <Page size="A4" style={styles.page}>
          <PageHeader personName={personName} />
          <Text style={styles.sectionTitle}>Tus saboteadores</Text>
          <Text style={styles.sectionSubtitle}>
            Solo autoevaluación -- nadie más puntúa esto, así que no hay media de compañeros.
          </Text>
          {interpretation?.saboteadores && (
            <View style={styles.card} wrap={false}>
              <Text style={styles.cardLabel}>SOBRE TUS SABOTEADORES (GENERADO POR IA)</Text>
              <PdfInterpretationBlock text={interpretation.saboteadores} competencies={competencyDescriptions} />
            </View>
          )}
          {sortedSaboteadores.map((row) => {
            const label = SABOTEADOR_LABELS[row.saboteadorCode] || row.saboteadorCode;
            const color = row.isHigh ? SABOTEADOR_TINT : INK_SOFT;
            return (
              <View key={row.saboteadorCode} style={styles.saboteadorRow} wrap={false}>
                <View style={styles.saboteadorLabelRow}>
                  <Text style={[styles.saboteadorName, { color: row.isHigh ? SABOTEADOR_TINT : INK }]}>
                    {label}
                  </Text>
                  <Text style={styles.saboteadorValue}>{row.avgValue.toFixed(1)} / 5</Text>
                </View>
                <View style={styles.saboteadorTrack}>
                  <View style={[styles.saboteadorFill, { width: `${(row.avgValue / 5) * 100}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
          <PageFooter />
        </Page>
      )}

      {hasOpenSection && (
        <Page size="A4" style={styles.page}>
          <PageHeader personName={personName} />
          <Text style={styles.sectionTitle}>Respuestas abiertas</Text>
          <Text style={styles.sectionSubtitle}>Lo que tus compañeros escribieron, palabra por palabra.</Text>
          {interpretation?.resumenAbiertas && (
            <View style={styles.card} wrap={false}>
              <Text style={styles.cardLabel}>RESUMEN DE LAS RESPUESTAS ABIERTAS (GENERADO POR IA)</Text>
              <PdfInterpretationBlock text={interpretation.resumenAbiertas} competencies={competencyDescriptions} />
            </View>
          )}
          {openQuestions.map((q) => (
            <View key={q.prompt} style={styles.questionBlock}>
              <Text style={styles.questionPrompt}>{q.prompt}</Text>
              {q.answers.map((answer, i) => (
                <Text key={i} style={styles.answer} wrap={false}>
                  {answer}
                </Text>
              ))}
            </View>
          ))}
          <PageFooter />
        </Page>
      )}
    </Document>
  );
}
