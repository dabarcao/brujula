import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createFeedbackRequest } from "@/app/actions/feedback";
import EvaluatorPicker from "@/components/EvaluatorPicker";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

const SUBTYPE_LABELS: Record<string, string> = {
  general: "General / desarrollo profesional",
  meeting: "Reunión / presentación",
  collaboration: "Colaboración",
  leadership_initiative: "Liderazgo de una iniciativa",
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
    .select("id, organization_id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!currentMember || currentMember.status !== "active") {
    redirect("/dashboard");
  }

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

  const { data: colleagues } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .neq("id", currentMember.id)
    .order("email");

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("min_invitees_per_request")
    .eq("organization_id", currentMember.organization_id)
    .maybeSingle();

  const minInvitees = settings?.min_invitees_per_request ?? 5;

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
          <fieldset className="border rounded p-4">
            <legend className="text-sm font-medium px-1">¿Sobre qué es el feedback?</legend>
            <div className="flex flex-col gap-2 mt-2">
              {Object.entries(SUBTYPE_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="subtype"
                    value={value}
                    defaultChecked={value === "general"}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <EvaluatorPicker colleagues={colleagues as ColleagueRow[]} checkboxName="inviteeIds" />

          <button
            type="submit"
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 self-start"
          >
            Enviar solicitud
          </button>
        </form>
      )}
    </main>
  );
}
