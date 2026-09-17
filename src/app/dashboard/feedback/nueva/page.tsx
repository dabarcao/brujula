import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import { createFeedbackRequest, createFeedbackRequestForIndividual } from "@/app/actions/feedback";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";
import Card from "@/components/ui/Card";
import ErrorBanner from "@/components/ui/ErrorBanner";

export default async function NewFeedbackRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const user = await authManager.getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();
  if (!currentMember || currentMember.status !== "active") {
    redirect("/dashboard");
  }

  const isIndividual = currentMember.organization?.kind === "individual";

  const openRequestId = await feedbackManager.getMyOpenRequestId(currentMember.id, "ad_hoc");

  if (openRequestId) {
    return (
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-ink">Pedir feedback</h1>
          <Link href="/dashboard" className="text-sm underline text-ink-soft">
            Volver al panel
          </Link>
        </div>
        <p className="text-sm text-ink-soft">
          Ya tienes una solicitud abierta. Solo puedes tener una a la vez —
          puedes modificarla o cancelarla (mientras nadie haya respondido
          todavía) desde su página.
        </p>
        <Link
          href={`/dashboard/feedback/${openRequestId}`}
          className="inline-block mt-4 underline text-sm text-ink"
        >
          Ver mi solicitud abierta
        </Link>
      </main>
    );
  }

  const minInvitees = await feedbackManager.getMinInviteesPerRequest(currentMember.organizationId);

  // Cuenta individual: no tiene compañeros dados de alta (su organización
  // es solo ella), así que invita por email en vez de elegir de una lista.
  if (isIndividual) {
    return (
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-ink">Pedir feedback</h1>
          <Link href="/dashboard" className="text-sm underline text-ink-soft">
            Volver al panel
          </Link>
        </div>

        <p className="text-sm text-ink-soft mb-6">
          Escribe el email de al menos {minInvitees} personas. Nadie sabrá qué
          respondió quién, y no verás nada hasta que respondan al menos 3.
        </p>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <form action={createFeedbackRequestForIndividual} className="flex flex-col gap-4">
          <NameField />
          <SubtypeFieldset />
          <EmailEvaluatorPicker fieldName="inviteeEmails" minEmails={minInvitees} primary />
        </form>
      </main>
    );
  }

  const colleagues = await feedbackManager.getEvaluatorCandidates(currentMember.id);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Pedir feedback</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-ink-soft mb-6">
        Elige al menos {minInvitees} compañeros. Nadie sabrá qué respondió
        quién, y no verás nada hasta que respondan al menos 3 personas.
      </p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {colleagues.length < minInvitees ? (
        <Card>
          <p className="text-sm text-ink-soft">
            Todavía no hay suficientes compañeros activos en tu organización
            (hacen falta al menos {minInvitees}). Invita a más empleados desde{" "}
            <Link href="/dashboard/members" className="underline text-ink">
              Gestionar empleados
            </Link>
            .
          </p>
        </Card>
      ) : (
        <form action={createFeedbackRequest} className="flex flex-col gap-4">
          <NameField />
          <SubtypeFieldset />
          <EvaluatorPicker
            colleagues={colleagues.map((c) => ({ id: c.id, email: c.email, full_name: c.fullName }))}
            checkboxName="inviteeIds"
            minSelected={minInvitees}
            submitLabel="Enviar solicitud"
            primary
          />
        </form>
      )}
    </main>
  );
}

function NameField() {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      Nombre para identificar este feedback (se mostrará como &ldquo;Feedback
      ágil {"{tu nombre}"}&rdquo;)
      <input
        name="name"
        type="text"
        required
        placeholder="Competencias — Q1"
        className="border border-line rounded-brujula-sm px-3 py-2 bg-paper-deep text-ink"
      />
    </label>
  );
}

// Solo "Por competencias" es un flujo real hoy (el único con informe
// construido — sección 5.2/17 del spec). Reconocimiento y Feedback
// periódico son ideas ya registradas (spec.md secciones 14/15/17)
// todavía sin construir — se dejan visibles pero deshabilitadas para que
// el roadmap se vea en la propia pantalla, en vez de mostrar subtipos
// viejos (general/reunión/colaboración/iniciativa) que nunca se llegaron
// a construir del todo y no tenían ningún plan real detrás.
function SubtypeFieldset() {
  return (
    <fieldset className="border border-line rounded-brujula-sm p-4">
      <legend className="text-sm font-medium text-ink px-1">¿Sobre qué es el feedback?</legend>
      <div className="flex flex-col gap-2 mt-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="radio" name="subtype" value="competencias" defaultChecked />
          Por competencias
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft cursor-not-allowed">
          <input type="radio" disabled />
          Reconocimiento <span className="text-xs">(en construcción)</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft cursor-not-allowed">
          <input type="radio" disabled />
          Feedback periódico <span className="text-xs">(en construcción)</span>
        </label>
      </div>
    </fieldset>
  );
}
