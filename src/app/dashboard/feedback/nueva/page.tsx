import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createFeedbackRequest } from "@/app/actions/feedback";

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
    .select("id, organization_id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!currentMember || currentMember.status !== "active") {
    redirect("/dashboard");
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
          <ul className="border rounded divide-y">
            {(colleagues as ColleagueRow[]).map((colleague) => (
              <li key={colleague.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  name="inviteeIds"
                  value={colleague.id}
                  id={`invitee-${colleague.id}`}
                />
                <label htmlFor={`invitee-${colleague.id}`} className="flex-1">
                  <span className="font-medium">
                    {colleague.full_name || colleague.email}
                  </span>
                  {colleague.full_name && (
                    <span className="text-gray-500"> · {colleague.email}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>

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
