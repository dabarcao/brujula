import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type GroupRow = {
  id: string;
  name: string;
  status: "open" | "closed";
  is_creator: boolean;
  my_status: "pending" | "accepted" | "rejected" | null;
  accepted_count: number;
  total_count: number;
};

export default async function ReportGroupsPage() {
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

  const { data: groupsData } = await supabase.rpc("get_my_report_groups");
  const groups = (groupsData as GroupRow[] | null) || [];

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Informes de grupo</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <Link
        href="/dashboard/groups/nuevo"
        className="inline-block mb-6 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Crear grupo
      </Link>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">
          No estás en ningún grupo todavía, ni como creador ni invitado.
        </p>
      ) : (
        <ul className="border rounded divide-y">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {g.name}
                <span className="text-gray-400">
                  {" "}
                  — {g.status === "closed" ? "cerrado" : "abierto"} ({g.accepted_count} de{" "}
                  {g.total_count} aceptados)
                  {g.my_status === "pending" && " · te falta responder"}
                </span>
              </span>
              <Link href={`/dashboard/groups/${g.id}`} className="underline text-gray-700 shrink-0">
                Ver
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
