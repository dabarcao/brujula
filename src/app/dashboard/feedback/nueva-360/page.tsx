import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createIndividualCycleRequest } from "@/app/actions/cycles";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import Onboarding360Wizard from "@/components/Onboarding360Wizard";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";
import { getPlatformText } from "@/lib/platformTexts";

export default async function NewIndividual360Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("id, organization_id, status, organizations(kind)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const isIndividual =
    (currentMember?.organizations as unknown as { kind: string } | null)?.kind === "individual";

  if (!currentMember || currentMember.status !== "active" || !isIndividual) {
    redirect("/dashboard");
  }

  const { data: openRequest } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("requester_member_id", currentMember.id)
    .eq("request_type", "cycle")
    .eq("status", "open")
    .maybeSingle();

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", currentMember.organization_id)
    .maybeSingle();

  const minInvitees = settings?.min_invitees_per_request ?? 5;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minClosesAt = tomorrow.toISOString().slice(0, 10);

  const inOneMonth = new Date();
  inOneMonth.setMonth(inOneMonth.getMonth() + 1);
  const defaultClosesAt = inOneMonth.toISOString().slice(0, 10);

  const [introText, seleccionText, confirmacionText] = await Promise.all([
    getPlatformText(
      supabase,
      "onboarding_360_intro",
      "Vas a pedirle a las personas que te rodean que te cuenten qué impacto tienes en ellas. Es anónimo e información, no una evaluación de desempeño."
    ),
    getPlatformText(
      supabase,
      "onboarding_360_seleccion",
      `Escribe el email de al menos ${minInvitees} personas y clasifícalas según su relación contigo. Nadie sabrá qué respondió quién.`
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
        <h1 className="text-2xl font-semibold">Pedir feedback 360</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <Onboarding360Wizard
        introText={introText}
        seleccionText={seleccionText}
        confirmacionText={confirmacionText}
        action={createIndividualCycleRequest}
        alreadyDone={Boolean(openRequest)}
        alreadyDoneContent={
          <div className="text-sm text-gray-600">
            <p className="mb-4">
              Ya tienes un 360 abierto. Espera a que termine antes de pedir otro.
            </p>
            <Link href={`/dashboard/feedback/${openRequest?.id}`} className="underline">
              Ver mi 360 abierto
            </Link>
          </div>
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          Nombre para identificar este 360 (se mostrará como &ldquo;Ciclo 360{" "}
          {"{tu nombre}"}&rdquo;)
          <input
            name="name"
            type="text"
            required
            placeholder="2026"
            className="border rounded px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm max-w-xs">
          Fecha límite para responder
          <input
            name="closesAt"
            type="date"
            required
            min={minClosesAt}
            defaultValue={defaultClosesAt}
            className="border rounded px-3 py-2"
          />
        </label>

        <EmailEvaluatorPicker
          fieldName="evaluatorEmails"
          minEmails={minInvitees}
          categoryOptions={EVALUATOR_CATEGORY_LABELS}
          categoryDefaultValue="team"
        />
      </Onboarding360Wizard>
    </main>
  );
}
