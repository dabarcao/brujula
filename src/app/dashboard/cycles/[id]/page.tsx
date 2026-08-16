import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { organizeCycleEvaluators } from "@/app/actions/cycles";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  manager: "Jefe / responsable directo",
  team: "Compañero de equipo",
  organization: "Compañero de la empresa",
  other: "Otro",
};

export default async function CyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
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
    .select("id, status")
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
    .neq("id", currentMember.id)
    .order("email");

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">{cycle.name}</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      {!isOpen ? (
        <p className="text-sm text-gray-600">
          Este ciclo no está abierto actualmente (del {cycle.opens_at} al{" "}
          {cycle.closes_at}).
        </p>
      ) : existingRequest ? (
        <div className="text-sm text-gray-600">
          <p className="mb-3">Ya has organizado tus evaluadores para este ciclo.</p>
          <Link
            href={`/dashboard/feedback/${existingRequest.id}`}
            className="underline"
          >
            Ver el progreso de tus respuestas
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-6">
            Elige a tus evaluadores y clasifícalos según su relación contigo.
            Tu autoevaluación se añade automáticamente. Nadie sabrá qué
            respondió quién, y no verás nada hasta que respondan suficientes
            personas.
          </p>

          {error && (
            <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
          )}

          <form action={organizeCycleEvaluators} className="flex flex-col gap-4">
            <input type="hidden" name="cycleId" value={id} />

            <ul className="border rounded divide-y">
              {(colleagues as ColleagueRow[] | null)?.map((colleague) => (
                <li key={colleague.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    name="evaluatorId"
                    value={colleague.id}
                    id={`evaluator-${colleague.id}`}
                  />
                  <label htmlFor={`evaluator-${colleague.id}`} className="flex-1">
                    {colleague.full_name || colleague.email}
                  </label>
                  <select
                    name={`category_${colleague.id}`}
                    defaultValue="team"
                    className="border rounded px-2 py-1 text-xs"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>

            <button
              type="submit"
              className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 self-start"
            >
              Confirmar evaluadores
            </button>
          </form>
        </>
      )}
    </main>
  );
}
