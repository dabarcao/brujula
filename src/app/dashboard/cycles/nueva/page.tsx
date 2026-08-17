import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createFeedbackCycle } from "@/app/actions/cycles";
import EvaluatorPicker from "@/components/EvaluatorPicker";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function NewCyclePage({
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
    .select("id, is_supervisor")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!currentMember || !currentMember.is_supervisor) {
    redirect("/dashboard");
  }

  const { data: colleagues } = await supabase
    .from("members")
    .select("id, email, full_name")
    .eq("status", "active")
    .neq("id", currentMember.id)
    .order("email");

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Nuevo ciclo 360</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Elige quién participa en este ciclo — solo ellos podrán organizar a
        sus evaluadores mientras esté abierto. Se usa la plantilla por
        defecto de 24 preguntas (escala 1-5 por competencia + 3 preguntas
        abiertas).
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      <form action={createFeedbackCycle} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Nombre del ciclo
          <input
            name="name"
            type="text"
            required
            placeholder="Evaluación de desempeño 2026"
            className="border rounded px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Fecha de apertura
          <input name="opensAt" type="date" required className="border rounded px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Fecha de cierre
          <input name="closesAt" type="date" required className="border rounded px-3 py-2" />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          Participantes
          <EvaluatorPicker
            colleagues={(colleagues as ColleagueRow[] | null) || []}
            checkboxName="participantId"
          />
        </div>

        <button
          type="submit"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 self-start mt-2"
        >
          Crear ciclo
        </button>
      </form>
    </main>
  );
}
