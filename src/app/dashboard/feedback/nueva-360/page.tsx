import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import type { CycleParticipantCategory } from "@/server/managers/cyclesManager";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import Onboarding360Wizard, { type WizardActionState } from "@/components/Onboarding360Wizard";
import { EVALUATOR_CATEGORY_LABELS } from "@/lib/evaluatorCategories";

export default async function NewIndividual360Page() {
  const user = await authManager.getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();
  const isIndividual = currentMember?.organization?.kind === "individual";

  if (!currentMember || currentMember.status !== "active" || !isIndividual) {
    redirect("/dashboard");
  }

  const openRequestId = await feedbackManager.getMyOpenRequestId(currentMember.id, "cycle");

  const minInvitees = await feedbackManager.getMinInviteesPerRequest(currentMember.organizationId);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minClosesAt = tomorrow.toISOString().slice(0, 10);

  const [introText, seleccionText, confirmacionText] = await Promise.all([
    feedbackManager.getPlatformText(
      "onboarding_360_intro",
      "Vas a pedirle a las personas que te rodean que te cuenten qué impacto tienes en ellas. Es anónimo e información, no una evaluación de desempeño."
    ),
    feedbackManager.getPlatformText(
      "onboarding_360_seleccion",
      `Escribe el email de al menos ${minInvitees} personas y clasifícalas según su relación contigo. Nadie sabrá qué respondió quién.`
    ),
    feedbackManager.getPlatformText(
      "onboarding_360_confirmacion",
      "En cuanto confirmes tu selección, cada persona recibirá automáticamente un email de invitación con el enlace para responder."
    ),
  ]);

  // Story 7.5: page-local Server Action -- see the matching comment in
  // src/app/dashboard/cycles/nueva/page.tsx's `startCycle` for why this
  // isn't the shared `createIndividualCycleRequest`
  // (src/app/actions/cycles.ts) export.
  async function submitIndividualRequest(
    _prevState: WizardActionState,
    formData: FormData
  ): Promise<WizardActionState> {
    "use server";

    const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
    const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));
    const closesAt = String(formData.get("closesAt") || "");
    const name = String(formData.get("name") || "").trim();

    try {
      await cyclesManager.createIndividualRequest(
        evaluatorEmails,
        categories as CycleParticipantCategory[],
        closesAt,
        name || null
      );
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }

    revalidatePath("/dashboard");
    return { success: true };
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Pedir feedback 360</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      <Onboarding360Wizard
        introText={introText}
        seleccionText={seleccionText}
        confirmacionText={confirmacionText}
        action={submitIndividualRequest}
        alreadyDone={Boolean(openRequestId)}
        alreadyDoneContent={
          <div className="text-sm text-ink-soft">
            <p className="mb-4">
              Ya tienes un 360 abierto. Espera a que termine antes de pedir otro.
            </p>
            <Link href={`/dashboard/feedback/${openRequestId}`} className="underline text-ink">
              Ver mi 360 abierto
            </Link>
          </div>
        }
      >
        <label className="flex flex-col gap-1 text-sm text-ink">
          Nombre para identificar este 360 (se mostrará como &ldquo;Ciclo 360{" "}
          {"{tu nombre}"}&rdquo;)
          <input
            name="name"
            type="text"
            required
            placeholder="2026"
            className="border border-line rounded-brujula-sm px-3 py-2 bg-paper-deep text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink max-w-xs">
          Fecha límite para responder
          <input
            name="closesAt"
            type="date"
            required
            min={minClosesAt}
            defaultValue={minClosesAt}
            className="border border-line rounded-brujula-sm px-3 py-2 bg-paper-deep text-ink"
          />
        </label>

        <EmailEvaluatorPicker
          fieldName="evaluatorEmails"
          minEmails={minInvitees}
          categoryOptions={EVALUATOR_CATEGORY_LABELS}
          categoryDefaultValue="team"
          primary
        />
      </Onboarding360Wizard>
    </main>
  );
}
