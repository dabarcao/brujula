import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  updateCycleRequestEvaluators,
  updateIndividualCycleRequestEvaluators,
} from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("id, organization_id, organizations(kind)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const isIndividualAccount =
    (currentMember?.organizations as unknown as { kind: string } | null)?.kind === "individual";

  const { data: request } = await supabase
    .from("feedback_requests")
    .select("id, requester_member_id, request_type, status, closes_at, name, feedback_cycles(name)")
    .eq("id", id)
    .maybeSingle();

  if (!request || !currentMember || request.requester_member_id !== currentMember.id) {
    redirect("/dashboard");
  }

  if (request.request_type !== "cycle") {
    redirect(`/dashboard/feedback/${id}`);
  }

  const { data: progressData } = await supabase
    .rpc("get_feedback_request_progress", { p_request_id: id })
    .maybeSingle();

  const progress = progressData as
    | { response_count: number; threshold: number; revealed: boolean; self_responded: boolean }
    | null;

  const totalResponseCount = (progress?.response_count ?? 0) + (progress?.self_responded ? 1 : 0);

  const { count: totalInvitees } = await supabase
    .from("feedback_invitations")
    .select("id", { count: "exact", head: true })
    .eq("feedback_request_id", id);

  const cycleClosesAt: string | null = request.closes_at ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const isFinal =
    request.status === "closed" ||
    (totalInvitees != null && totalResponseCount >= totalInvitees) ||
    (cycleClosesAt != null && cycleClosesAt < today);

  // Se puede seguir añadiendo evaluadores mientras el proceso no esté
  // cerrado, aunque ya haya respuestas — pero solo se puede modificar la
  // categoría o quitar a alguien ya invitado mientras nadie haya respondido
  // todavía.
  const canManageCycle = request.status === "open" && !isFinal;
  const canFullyEditCycle = canManageCycle && totalResponseCount === 0;

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", currentMember.organization_id)
    .maybeSingle();
  const minInvitees = settings?.min_invitees_per_request ?? 5;

  let colleagues: ColleagueRow[] | null = null;
  let currentInviteeIds: string[] = [];
  let categoryDefaultsById: Record<string, string> = {};
  let currentInviteeEmails: string[] = [];
  let categoryDefaultsByEmail: Record<string, string> = {};

  if (isIndividualAccount) {
    const { data: invitations } = await supabase
      .from("feedback_invitations")
      .select("invitee_email, evaluator_category")
      .eq("feedback_request_id", id)
      .not("invitee_email", "is", null);
    currentInviteeEmails = (invitations || [])
      .map((i) => i.invitee_email)
      .filter((v): v is string => Boolean(v));
    categoryDefaultsByEmail = Object.fromEntries(
      (invitations || [])
        .filter((i) => i.invitee_email && i.evaluator_category)
        .map((i) => [i.invitee_email as string, i.evaluator_category as string])
    );
  } else {
    const { data: colleaguesData } = await supabase
      .from("members")
      .select("id, email, full_name")
      .eq("status", "active")
      .eq("is_supervisor", false)
      .neq("id", currentMember.id)
      .order("email");
    colleagues = colleaguesData;

    const { data: invitations } = await supabase
      .from("feedback_invitations")
      .select("invitee_member_id, evaluator_category")
      .eq("feedback_request_id", id)
      .or("evaluator_category.is.null,evaluator_category.neq.self");
    currentInviteeIds = (invitations || [])
      .map((i) => i.invitee_member_id)
      .filter((v): v is string => Boolean(v));
    categoryDefaultsById = Object.fromEntries(
      (invitations || [])
        .filter((i) => i.invitee_member_id && i.evaluator_category)
        .map((i) => [i.invitee_member_id as string, i.evaluator_category as string])
    );
  }

  const cycleName = (request.feedback_cycles as unknown as { name: string } | null)?.name;
  const requestName = cycleName || request.name;

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Gestionar evaluadores</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-7">{requestName || " "}</p>

      {error && <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>}
      {updated && !error && (
        <p className="mb-6 rounded bg-green-50 text-green-700 text-sm p-3">Cambios guardados.</p>
      )}

      {canManageCycle ? (
        <>
          <p className="text-sm text-gray-500 mb-4">
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
              />
            </form>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">
          El proceso ya ha terminado, así que no se puede cambiar nada más.
        </p>
      )}
    </main>
  );
}
