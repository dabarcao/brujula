import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createIndividualCycleRequest } from "@/app/actions/cycles";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";
import { getPlatformText } from "@/lib/platformTexts";

export default async function NewIndividual360Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

  if (openRequest) {
    return (
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">Pedir feedback 360</h1>
          <Link href="/dashboard" className="text-sm underline text-gray-600">
            Volver al panel
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          Ya tienes un 360 abierto. Espera a que termine antes de pedir otro.
        </p>
        <Link
          href={`/dashboard/feedback/${openRequest.id}`}
          className="inline-block mt-4 underline text-sm"
        >
          Ver mi 360 abierto
        </Link>
      </main>
    );
  }

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", currentMember.organization_id)
    .maybeSingle();

  const minInvitees = settings?.min_invitees_per_request ?? 5;

  const introText = await getPlatformText(
    supabase,
    "individual_360_intro",
    `El cuestionario completo de 360º (las 14 competencias) más tu propia autoevaluación. Escribe el email de al menos ${minInvitees} personas. Nadie sabrá qué respondió quién, y no verás nada hasta que respondan al menos 3.`
  );

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Pedir feedback 360</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">{introText}</p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      <form action={createIndividualCycleRequest} className="flex flex-col gap-4">
        <EmailEvaluatorPicker
          fieldName="evaluatorEmails"
          minEmails={minInvitees}
          categoryOptions={EVALUATOR_CATEGORY_LABELS}
          categoryDefaultValue="team"
        />
      </form>
    </main>
  );
}
