import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import {
  updateCycleRequestEvaluators,
  updateIndividualCycleRequestEvaluators,
} from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";
import ErrorBanner from "@/components/ui/ErrorBanner";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

// Página separada de la del informe (feedback/[id]/page.tsx): gestionar
// evaluadores y ver el informe son dos tareas distintas, no tiene sentido
// mezclarlas en la misma pantalla.
export default async function ManageCycleEvaluatorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { id } = await params;
  const { error, updated } = await searchParams;

  const user = await authManager.getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();
  const isIndividualAccount = currentMember?.organization?.kind === "individual";

  const state = await feedbackManager.getRequestState(id);

  if (!state || !currentMember || state.request.requesterMemberId !== currentMember.id) {
    redirect("/dashboard");
  }

  if (state.request.requestType !== "cycle") {
    redirect(`/dashboard/feedback/${id}`);
  }

  // "El usuario es el dueño de su proceso, no las condiciones" (sección
  // 4.1): un 360 ya no se cierra solo por fecha ni por 100% de
  // respuestas — status = 'open' es la única condición, así que se puede
  // seguir añadiendo evaluadores hasta que el propio solicitante decida
  // finalizarlo (informe del 360). Solo se puede modificar la categoría o
  // quitar a alguien ya invitado mientras nadie haya respondido todavía.
  // canManageCycle/canFullyEditCycle vienen de feedbackManager.getRequestState
  // -- la misma fuente de verdad (status de la solicitud + recuento de
  // respuestas) que usa [id]/page.tsx para su propio isFinal, en vez de
  // que cada página reinvente su propia fórmula.
  const { request, canManageCycle, canFullyEditCycle } = state;

  const minInvitees = await feedbackManager.getMinInviteesPerRequest(currentMember.organizationId);

  let colleagues: ColleagueRow[] | null = null;
  let currentInviteeIds: string[] = [];
  let categoryDefaultsById: Record<string, string> = {};
  let currentInviteeEmails: string[] = [];
  let categoryDefaultsByEmail: Record<string, string> = {};

  if (isIndividualAccount) {
    const invitations = await feedbackManager.getFeedbackRequestEmailInvitations(id);
    currentInviteeEmails = invitations.map((i) => i.email);
    categoryDefaultsByEmail = Object.fromEntries(
      invitations.filter((i) => i.evaluatorCategory).map((i) => [i.email, i.evaluatorCategory as string])
    );
  } else {
    const colleaguesRaw = await feedbackManager.getEvaluatorCandidates(currentMember.id);
    colleagues = colleaguesRaw.map((c) => ({ id: c.id, email: c.email, full_name: c.fullName }));

    const invitations = await feedbackManager.getFeedbackRequestMemberInvitations(id);
    currentInviteeIds = invitations.map((i) => i.memberId);
    categoryDefaultsById = Object.fromEntries(
      invitations.filter((i) => i.evaluatorCategory).map((i) => [i.memberId, i.evaluatorCategory as string])
    );
  }

  const requestName = request.cycleName || request.name;

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-ink">Gestionar evaluadores</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-ink-soft mb-7">{requestName || " "}</p>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {updated && !error && (
        <p className="mb-6 rounded-brujula-md bg-indigo-wash text-ink text-sm p-3">
          Cambios guardados.
        </p>
      )}

      {canManageCycle ? (
        <>
          <p className="text-sm text-ink-soft mb-4">
            {canFullyEditCycle
              ? "Todavía nadie ha respondido, así que puedes cambiar a quién elegiste como evaluador o su categoría. Tu autoevaluación no se ve afectada."
              : "Ya hay respuestas, así que quien ya estaba invitado no se puede quitar ni cambiar de categoría — pero puedes seguir añadiendo más evaluadores mientras el proceso siga abierto."}
          </p>
          {isIndividualAccount ? (
            <form action={updateIndividualCycleRequestEvaluators} className="flex flex-col gap-3">
              <input type="hidden" name="requestId" value={id} />
              <EmailEvaluatorPicker
                fieldName="evaluatorEmails"
                minEmails={minInvitees}
                categoryOptions={EVALUATOR_CATEGORY_LABELS}
                categoryDefaultValue="team"
                defaultEmails={currentInviteeEmails}
                categoryDefaultsByEmail={categoryDefaultsByEmail}
                canModifyExisting={canFullyEditCycle}
                submitLabel="Guardar cambios"
                primary
              />
            </form>
          ) : (
            <form action={updateCycleRequestEvaluators} className="flex flex-col gap-3">
              <input type="hidden" name="requestId" value={id} />
              <EvaluatorPicker
                colleagues={colleagues || []}
                checkboxName="evaluatorId"
                defaultCheckedIds={currentInviteeIds}
                categoryOptions={EVALUATOR_CATEGORY_LABELS}
                categoryDefaultValue="team"
                categoryDefaultsById={categoryDefaultsById}
                minSelected={minInvitees}
                canModifyExisting={canFullyEditCycle}
                submitLabel="Guardar cambios"
                primary
              />
            </form>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          El proceso ya ha terminado, así que no se puede cambiar nada más.
        </p>
      )}
    </main>
  );
}
