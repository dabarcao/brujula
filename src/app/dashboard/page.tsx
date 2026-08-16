import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let { data: member } = await supabase
    .from("members")
    .select("id, role, organization_id, organizations(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Primera vez que este usuario entra tras confirmar su correo: si guardó
  // un nombre de empresa pendiente al registrarse, la creamos ahora.
  if (!member) {
    const pendingOrgName = user.user_metadata?.pending_org_name as
      | string
      | undefined;

    if (pendingOrgName) {
      const { error } = await supabase.rpc("create_organization_and_admin", {
        org_name: pendingOrgName,
      });

      if (!error) {
        const { data: refreshedMember } = await supabase
          .from("members")
          .select("id, role, organization_id, organizations(name)")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        member = refreshedMember;
      }
    }
  }

  if (!member) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="mb-4">
            Tu cuenta todavía no está asociada a ninguna organización.
          </p>
          <form action={signOut}>
            <button className="underline text-sm">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  const orgName = (member.organizations as unknown as { name: string } | null)?.name;

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">{orgName}</h1>
        <form action={signOut}>
          <button className="text-sm underline text-gray-600">Cerrar sesión</button>
        </form>
      </div>

      <p className="text-gray-600">
        Sesión iniciada como <strong>{user.email}</strong>
        {member.role === "org_admin" ? " (administrador)" : ""}.
      </p>

      <p className="text-sm text-gray-500 mt-6">
        Aquí irán tus solicitudes de feedback, tu mapa de competencias y,
        si eres administrador, las métricas agregadas de tu organización —
        siguiente paso de la construcción.
      </p>
    </main>
  );
}
