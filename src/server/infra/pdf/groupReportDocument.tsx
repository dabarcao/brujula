// Documento PDF del informe de grupo (docs/spec.md sección 17, mismo
// diseño "Humanista Brújula" que individual360Document.tsx). A diferencia
// del individual: sin saboteadores (no existen a nivel de grupo) y sin
// respuestas abiertas en bruto (el grupo nunca ve el texto literal de
// nadie, solo la síntesis ya anonimizada de "Patrones para conversar" --
// mismo criterio que la pantalla web).

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfCompassBadge, PdfWatermark } from "./brand";
import { PdfCompetencyChart, type PdfChartAxis } from "./radarChart";
import { PdfInterpretationBlock } from "./interpretationBlock";

const INK = "#1C2033";
const INK_SOFT = "#5B5F7A";
const PAPER = "#F7F4EE";
const LINE = "#E4DFD3";
const INDIGO_WASH = "#EEF3E0";

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
});

function PageHeader({ groupName }: { groupName: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerBrand}>
        <PdfCompassBadge size={16} />
        <Text style={styles.headerBrandText}>Brújula</Text>
      </View>
      <Text style={styles.headerName}>Informe de equipo — {groupName}</Text>
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

export type GroupReportPdfData = {
  groupName: string;
  memberCount: number;
  interpretation: string | null;
  openPatterns: string | null;
  competencyDescriptions: { name: string; description: string }[];
  axes: PdfChartAxis[];
};

export function GroupReportDocument({ data }: { data: GroupReportPdfData }) {
  const { groupName, memberCount, interpretation, openPatterns, competencyDescriptions, axes } = data;

  return (
    <Document title={`Informe de equipo · ${groupName}`} author="Brújula">
      <Page size="A4" style={styles.cover}>
        <View style={styles.coverWatermark}>
          <PdfWatermark size={380} opacity={0.06} />
        </View>
        <View style={styles.coverBadge}>
          <PdfCompassBadge size={64} />
        </View>
        <Text style={styles.coverTitle}>Informe de equipo</Text>
        <Text style={styles.coverSubtitle}>{groupName}</Text>
        <Text style={styles.coverSubtitle}>
          {memberCount === 1 ? "1 persona" : `${memberCount} personas`}
        </Text>
        <Text style={styles.coverTagline}>Encuentra tu rumbo, con feedback seguro.</Text>
      </Page>

      {interpretation && (
        <Page size="A4" style={styles.page}>
          <PageHeader groupName={groupName} />
          <Text style={styles.sectionTitle}>Interpretación del grupo</Text>
          <Text style={styles.sectionSubtitle}>Generado por IA a partir de los datos de competencias del equipo.</Text>
          <PdfInterpretationBlock text={interpretation} competencies={competencyDescriptions} />
          <PageFooter />
        </Page>
      )}

      <Page size="A4" style={styles.page}>
        <PageHeader groupName={groupName} />
        <Text style={styles.sectionTitle}>Comparativa por competencias</Text>
        <Text style={styles.sectionSubtitle}>
          Media de cómo evalúan sus compañeros a cada miembro, frente a la autopercepción del equipo.
        </Text>
        <PdfCompetencyChart
          axes={axes}
          categorySeries={[]}
          size={300}
          selfLabel="Auto-percepción (equipo)"
          peerLabel="Evaluadores"
        />
        <PageFooter />
      </Page>

      {openPatterns && (
        <Page size="A4" style={styles.page}>
          <PageHeader groupName={groupName} />
          <Text style={styles.sectionTitle}>Patrones para conversar</Text>
          <Text style={styles.sectionSubtitle}>
            Generado por IA a partir de las respuestas abiertas del equipo -- nunca atribuido a una persona.
          </Text>
          <PdfInterpretationBlock text={openPatterns} competencies={competencyDescriptions} />
          <PageFooter />
        </Page>
      )}
    </Document>
  );
}
