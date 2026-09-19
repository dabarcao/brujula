// Brújula — infra de generación de PDF (docs/spec.md sección 17). Única
// pieza junto con ./pdf/* que importa @react-pdf/renderer -- sin
// Supabase, mismo patrón que infra/email.ts (AD-12): el manager que llama
// a esto ya hizo todas las comprobaciones de permisos y ya trae los datos
// listos.

import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { Individual360Document, type Individual360PdfData } from "./pdf/individual360Document";
import { GroupReportDocument, type GroupReportPdfData } from "./pdf/groupReportDocument";

export async function renderIndividual360Pdf(data: Individual360PdfData): Promise<Buffer> {
  return renderToBuffer(Individual360Document({ data }));
}

export async function renderGroupReportPdf(data: GroupReportPdfData): Promise<Buffer> {
  return renderToBuffer(GroupReportDocument({ data }));
}
