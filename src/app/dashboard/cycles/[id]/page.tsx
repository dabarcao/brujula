import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { organizeCycleEvaluators } from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import Onboarding360Wizard from "@/components/Onboarding360Wizard";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";
import { getPlatformText } from "@/lib/platformTexts";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function CyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("id, status, organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!currentMember || currentMember.status !== "active") {
    redirect("/dashboard");
  }

  const { data: cycle } = await supabase
    .from("feedback_cycles")
    .select("id, name, opens_at, closes_at")
    .eq("id", id)
    .maybeSingle();

  if (!cycle) {
    redirect("/dashboard");
  }

  const today = new Date().toISOString().slice(0, 10);
  const isOpen = cycle.opens_at <= today && today <= cycle.closes_at;

  const { data: participation } = await supabase
    .from("feedback_cycle_participants")
    .select("cycle_id")
    .eq("cycle_id", id)
    .eq("member_id", currentMember.id)
    .maybeSingle();

  const isParticipant = Boolean(participation);

  const { data: existingRequest } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("cycle_id", id)
    .eq("requester_member_id", currentMember.id)
    .maybeSingle();

  const { data: colleagues } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .eq("is_supervisor", false)
    .neq("id", currentMember.id)
    .order("email");

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", currentMember.organization_id)
    .maybeSingle();

  const minInvitees = settings?.min_invitees_per_request ?? 5;

  const [introText, seleccionText, confirmacionText] = await Promise.all([
    getPlatformText(
      supabase,
      "onboarding_360_intro",
      "Vas a pedirle a las personas que te rodean que te cuenten qué impacto tienes en ellas. Es anónimo e información, no una evaluación de desempeño."
    ),
    getPlatformText(
      supabase,
      "onboarding_360_seleccion",
      "Elige a tus evaluadores y clasifícalos según su relación contigo. Tu autoevaluación se añade automáticamente."
    ),
    getPlatformText(
      supabase,
      "onboarding_360_confirmacion",
      "En cuanto confirmes tu selección, cada persona recibirá automáticamente un email de invitación con el enlace para responder."
    ),
  ]);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Ciclo 360 {cycle.name}</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      {!isParticipant ? (
        <p className="text-sm text-gray-600">
          No has sido seleccionado como participante de este ciclo.
        </p>
      ) : !isOpen ? (
        <p className="text-sm text-gray-600">
          Este ciclo no está abierto actualmente (del {cycle.opens_at} al{" "}
          {cycle.closes_at}).
        </p>
      ) : (
        <Onboarding360Wizard
          introText={introText}
          seleccionText={seleccionText}
          confirmacionText={confirmacionText}
          action={organizeCycleEvaluators}
          alreadyDone={Boolean(existingRequest)}
          alreadyDoneContent={
            <div className="text-sm text-gray-600">
              <p className="mb-3">Ya has organizado tus evaluadores para este ciclo.</p>
              <Link href={`/dashboard/feedback/${existingRequest?.id}`} className="underline">
                Ver el progreso de tus respuestas
              </Link>
            </div>
          }
        >
          <input type="hidden" name="cycleId" value={id} />

          <EvaluatorPicker
            colleagues={(colleagues as ColleagueRow[] | null) || []}
            checkboxName="evaluatorId"
            categoryOptions={EVALUATOR_CATEGORY_LABELS}
            categoryDefaultValue="team"
            minSelected={minInvitees}
            submitLabel="Confirmar evaluadores"
            primary
          />
        </Onboarding360Wizard>
      )}
    </main>
  );
}
