import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createFeedbackRequest, createFeedbackRequestForIndividual } from "@/app/actions/feedback";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import EmailEvaluatorPicker from "@/components/EmailEvaluatorPicker";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function NewFeedbackRequestPage({
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

  if (!currentMember || currentMember.status !== "active") {
    redirect("/dashboard");
  }

  const isIndividual =
    (currentMember.organizations as unknown as { kind: string } | null)?.kind === "individual";

  const { data: openRequest } = await supabase
    .from("feedback_requests")
    .select("id")
    .eq("requester_member_id", currentMember.id)
    .eq("request_type", "ad_hoc")
    .eq("status", "open")
    .maybeSingle();

  if (openRequest) {
    return (
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">Pedir feedback</h1>
          <Link href="/dashboard" className="text-sm underline text-gray-600">
            Volver al panel
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          Ya tienes una solicitud abierta. Solo puedes tener una a la vez —
          puedes modificarla o cancelarla (mientras nadie haya respondido
          todavía) desde su página.
        </p>
        <Link
          href={`/dashboard/feedback/${openRequest.id}`}
          className="inline-block mt-4 underline text-sm"
        >
          Ver mi solicitud abierta
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

  // Cuenta individual: no tiene compañeros dados de alta (su organización
  // es solo ella), así que invita por email en vez de elegir de una lista.
  if (isIndividual) {
    return (
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">Pedir feedback</h1>
          <Link href="/dashboard" className="text-sm underline text-gray-600">
            Volver al panel
          </Link>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Escribe el email de al menos {minInvitees} personas. Nadie sabrá qué
          respondió quién, y no verás nada hasta que respondan al menos 3.
        </p>

        {error && (
          <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
        )}

        <form action={createFeedbackRequestForIndividual} className="flex flex-col gap-4">
          <NameField />
          <SubtypeFieldset />
          <EmailEvaluatorPicker fieldName="inviteeEmails" minEmails={minInvitees} />
        </form>
      </main>
    );
  }

  const { data: colleagues } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .eq("is_supervisor", false)
    .neq("id", currentMember.id)
    .order("email");

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Pedir feedback</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Elige al menos {minInvitees} compañeros. Nadie sabrá qué respondió
        quién, y no verás nada hasta que respondan al menos 3 personas.
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      {!colleagues || colleagues.length < minInvitees ? (
        <p className="text-sm text-gray-500">
          Todavía no hay suficientes compañeros activos en tu organización
          (hacen falta al menos {minInvitees}). Invita a más empleados desde{" "}
          <Link href="/dashboard/members" className="underline">
            Gestionar empleados
          </Link>
          .
        </p>
      ) : (
        <form action={createFeedbackRequest} className="flex flex-col gap-4">
          <NameField />
          <SubtypeFieldset />
          <EvaluatorPicker
            colleagues={colleagues as ColleagueRow[]}
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
    <label className="flex flex-col gap-1 text-sm">
      Nombre para identificar este feedback (se mostrará como &ldquo;Feedback
      ágil {"{tu nombre}"}&rdquo;)
      <input
        name="name"
        type="text"
        required
        placeholder="Competencias — Q1"
        className="border rounded px-3 py-2"
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
    <fieldset className="border rounded p-4">
      <legend className="text-sm font-medium px-1">¿Sobre qué es el feedback?</legend>
      <div className="flex flex-col gap-2 mt-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="subtype" value="competencias" defaultChecked />
          Por competencias
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
          <input type="radio" disabled />
          Reconocimiento <span className="text-xs">(en construcción)</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
          <input type="radio" disabled />
          Feedback periódico <span className="text-xs">(en construcción)</span>
        </label>
      </div>
    </fieldset>
  );
}
