import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type StatusRow = {
  member_id: string;
  full_name: string | null;
  email: string;
  status: "no_iniciado" | "en_progreso" | "completado";
};

const STATUS_LABELS: Record<StatusRow["status"], { label: string; className: string }> = {
  no_iniciado: { label: "No iniciado", className: "bg-gray-100 text-gray-600" },
  en_progreso: { label: "En progreso", className: "bg-amber-50 text-amber-700" },
  completado: { label: "Completado", className: "bg-green-50 text-green-700" },
};

export default async function CycleStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, is_supervisor")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member || !member.is_supervisor) {
    redirect("/dashboard");
  }

  const { data: cycle } = await supabase
    .from("feedback_cycles")
    .select("id, name, opens_at, closes_at")
    .eq("id", id)
    .maybeSingle();

  if (!cycle) {
    redirect("/dashboard/cycles");
  }

  const { data: statusData, error } = await supabase.rpc("get_cycle_status", {
    p_cycle_id: id,
  });

  const rows = (statusData as StatusRow[] | null) || [];

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">{cycle.name}</h1>
        <Link href="/dashboard/cycles" className="text-sm underline text-gray-600">
          Volver a ciclos
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        {cycle.opens_at} → {cycle.closes_at}
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error.message}</p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Este ciclo todavía no tiene participantes.</p>
      ) : (
        <table className="w-full text-sm border rounded overflow-hidden">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">Empleado</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const status = STATUS_LABELS[row.status];
              return (
                <tr key={row.member_id}>
                  <td className="px-4 py-2">{row.full_name || row.email}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
