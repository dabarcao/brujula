// GET /api/feedback/[id]/pdf -> pdfManager.generateIndividual360Pdf.
// Route Handler, no Server Action: la descarga necesita una respuesta
// binaria real (docs/spec.md sección 17). Mismo patrón de auth que el
// resto de src/app/api/** (requireAuthorizedRequest lee la cookie
// brujula_app_token que ya viaja en cualquier navegación normal del
// navegador -- no hace falta ningún fetch a medida para un GET) --
// el permiso real de "es tu propio informe, y ya está finalizado" lo
// comprueba el manager con la sesión de Supabase, como siempre.

import "server-only";
import { generateIndividual360Pdf } from "@/server/managers/pdfManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la solicitud no es válido.");

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
    const pdfBuffer = await generateIndividual360Pdf(id);
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="informe-360.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[feedback] GET /api/feedback/[id]/pdf unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
