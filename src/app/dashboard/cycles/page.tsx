import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CyclesListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, is_supervisor, organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member || !member.is_supervisor) {
    redirect("/dashboard");
  }

  const { data: cycles } = await supabase
    .from("feedback_cycles")
    .select("id, name, opens_at, closes_at")
    .eq("organization_id", member.organization_id)
    .order("opens_at", { ascending: false });

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Ciclos 360</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      <div className="mb-6">
        <Link
          href="/dashboard/cycles/nueva"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Crear ciclo 360
        </Link>
      </div>

      {!cycles || cycles.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no has creado ningún ciclo 360.</p>
      ) : (
        <ul className="border rounded divide-y">
          {cycles.map((cycle) => (
            <li key={cycle.id} className="px-4 py-3 text-sm">
              <Link href={`/dashboard/cycles/${cycle.id}/estado`} className="underline">
                Ciclo 360 {cycle.name}
              </Link>
              <span className="text-gray-500">
                {" "}
                · {cycle.opens_at} → {cycle.closes_at}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
