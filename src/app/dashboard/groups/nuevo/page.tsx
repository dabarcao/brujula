import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createReportGroup } from "@/app/actions/reportGroups";
import EvaluatorPicker from "@/components/EvaluatorPicker";

type ColleagueRow = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function NewReportGroupPage({
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
    .select("id, status, organizations(kind)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const isCompany =
    (currentMember?.organizations as unknown as { kind: string } | null)?.kind === "company";

  if (!currentMember || currentMember.status !== "active" || !isCompany) {
    redirect("/dashboard");
  }

  const { data: colleagues } = await supabase.rpc("get_colleagues_with_closed_cycle");

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Nuevo informe de grupo</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Elige a quién invitar — cada uno recibirá una tarea pendiente para
        confirmar o rechazar antes de contar en el grupo. Solo aparecen
        compañeros que ya tienen al menos un 360 finalizado: es lo único
        que se agrega, no se pide nada nuevo.
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      {!colleagues || colleagues.length === 0 ? (
        <p className="text-sm text-gray-500">
          Todavía no hay compañeros con un 360 ya finalizado. En cuanto
          alguien finalice el suyo, podrás invitarle aquí.
        </p>
      ) : (
        <form action={createReportGroup} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Nombre del grupo
            <input
              name="name"
              type="text"
              required
              placeholder="Equipo de ventas"
              className="border rounded px-3 py-2"
            />
          </label>

          <EvaluatorPicker
            colleagues={colleagues as ColleagueRow[]}
            checkboxName="memberId"
            minSelected={1}
            submitLabel="Crear grupo"
            primary
          />
        </form>
      )}
    </main>
  );
}
