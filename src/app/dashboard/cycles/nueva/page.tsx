import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import Onboarding360Wizard, { type WizardActionState } from "@/components/Onboarding360Wizard";

export default async function NewCyclePage() {
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();

  if (!currentMember || !currentMember.isSupervisor) {
    redirect("/dashboard");
  }

  const colleagues = await cyclesManager.listCycleParticipantCandidates(currentMember.id);

  // Claves propias de esta pantalla (no onboarding_360_*): esas están
  // escritas en segunda persona para quien va a SER evaluado ("vas a
  // pedirle a las personas que te rodean que te cuenten qué impacto tienes
  // en ellas"), que es exactamente lo contrario de lo que hace un
  // supervisor aquí -- crear un ciclo PARA OTROS, no para sí mismo. Ver
  // migración 0098_cycle_onboarding_texts_for_supervisor.sql.
  const [introText, seleccionText, confirmacionText] = await Promise.all([
    feedbackManager.getPlatformText(
      "onboarding_cycle_intro",
      "Vas a poner en marcha un proceso de Feedback 360 para las personas que elijas, no para ti. Como supervisor, decides quién participa y cuándo."
    ),
    feedbackManager.getPlatformText(
      "onboarding_cycle_seleccion",
      "Elige a las personas que van a hacer su 360 en este ciclo — cada una organizará después a sus propios evaluadores."
    ),
    feedbackManager.getPlatformText(
      "onboarding_cycle_confirmacion",
      "Ciclo creado. Cada participante lo verá reflejado en su panel y desde ahí podrá organizar a sus propios evaluadores."
    ),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const inOneMonth = new Date();
  inOneMonth.setMonth(inOneMonth.getMonth() + 1);
  const defaultClosesAt = inOneMonth.toISOString().slice(0, 10);

  // Story 7.5: page-local Server Action, not `createFeedbackCycle`
  // (src/app/actions/cycles.ts) -- that shared export always redirects on
  // completion (never returns), which is incompatible with
  // `useActionState`'s (prevState, formData) => state contract the wizard
  // needs to stay on this page for the confirmación step. Same manager
  // call, same validation, just returning instead of redirecting; adapting
  // the shared action itself is out of this story's file scope (see the
  // story's own Boundaries -- src/app/actions/cycles.ts isn't in it).
  async function startCycle(
    _prevState: WizardActionState,
    formData: FormData
  ): Promise<WizardActionState> {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const participantIds = formData.getAll("participantId").map(String);

    if (!name) {
      return { error: "Ponle un nombre al ciclo." };
    }

    try {
      // Sin selector de fechas en el formulario (ajuste 2026-09-17): abre
      // hoy mismo, cierra dentro de un mes -- el supervisor ya no elige
      // ninguna de las dos.
      await cyclesManager.createCycle(name, today, defaultClosesAt, participantIds);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }

    revalidatePath("/dashboard");
    return { success: true };
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Nuevo ciclo 360</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      <Onboarding360Wizard
        introText={introText}
        seleccionText={seleccionText}
        confirmacionText={confirmacionText}
        action={startCycle}
      >
        <label className="flex flex-col gap-1 text-sm text-ink">
          Nombre del ciclo (se mostrará como &ldquo;Ciclo 360 {"{tu nombre}"}&rdquo;)
          <input
            name="name"
            type="text"
            required
            placeholder="Otoño 2026"
            className="border border-line rounded-brujula-sm px-3 py-2 bg-paper-deep text-ink"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm text-ink">
          Participantes
          <EvaluatorPicker
            colleagues={colleagues.map((c) => ({
              id: c.id,
              email: c.email,
              full_name: c.fullName,
            }))}
            checkboxName="participantId"
            submitLabel="Crear ciclo"
            primary
          />
        </div>
      </Onboarding360Wizard>
    </main>
  );
}
