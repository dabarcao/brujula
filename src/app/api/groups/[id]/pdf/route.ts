// GET /api/groups/[id]/pdf -> pdfManager.generateGroupReportPdf. Mismo
// patrón que /api/feedback/[id]/pdf (route.ts hermano) -- ver su propio
// comentario para el porqué de requireAuthorizedRequest en un GET normal
// de navegador.

import "server-only";
import { generateGroupReportPdf } from "@/server/managers/pdfManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidId = () =>
  jsonError(422, "validation_error", "El identificador del grupo no es válido.");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return invalidId();
  }

  try {
    const pdfBuffer = await generateGroupReportPdf(id);
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="informe-grupo.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[groups] GET /api/groups/[id]/pdf unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
