import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import { organizeCycleEvaluators } from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";
import ErrorBanner from "@/components/ui/ErrorBanner";

export default async function CyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();

  if (!currentMember || currentMember.status !== "active") {
    redirect("/dashboard");
  }

  const cycle = await cyclesManager.getCycleById(id);

  if (!cycle) {
    redirect("/dashboard");
  }

  const isParticipant = await cyclesManager.isCycleParticipant(id, currentMember.id);

  const existingRequestId = await cyclesManager.getExistingCycleRequestId(id, currentMember.id);

  const colleagues = await cyclesManager.listEvaluatorCandidates(currentMember.id);

  const minInvitees = await cyclesManager.getMinInviteesPerRequest(currentMember.organizationId);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Ciclo 360 {cycle.name}</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      {!isParticipant ? (
        <p className="text-sm text-ink-soft">
          No has sido seleccionado como participante de este ciclo.
        </p>
      ) : !cycle.isOpen ? (
        <p className="text-sm text-ink-soft">
          Este ciclo no está abierto actualmente (del {cycle.opensAt} al{" "}
          {cycle.closesAt}).
        </p>
      ) : existingRequestId ? (
        <div className="text-sm text-ink-soft">
          <p className="mb-3">Ya has organizado tus evaluadores para este ciclo.</p>
          <Link
            href={`/dashboard/feedback/${existingRequestId}`}
            className="underline text-ink"
          >
            Ver el progreso de tus respuestas
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-soft mb-6">
            Elige a tus evaluadores y clasifícalos según su relación contigo.
            Tu autoevaluación se añade automáticamente. Nadie sabrá qué
            respondió quién, y no verás nada hasta que respondan suficientes
            personas.
          </p>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <form action={organizeCycleEvaluators} className="flex flex-col gap-4">
            <input type="hidden" name="cycleId" value={id} />

            <EvaluatorPicker
              colleagues={colleagues.map((c) => ({
                id: c.id,
                email: c.email,
                full_name: c.fullName,
              }))}
              checkboxName="evaluatorId"
              categoryOptions={EVALUATOR_CATEGORY_LABELS}
              categoryDefaultValue="team"
              minSelected={minInvitees}
              submitLabel="Confirmar evaluadores"
              primary
            />
          </form>
        </>
      )}
    </main>
  );
}
