import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  is_manager: boolean;
  is_supervisor: boolean;
  department_name: string | null;
  created_at: string;
};

type OrganizationRow = {
  id: string;
  name: string;
};

export default async function AdminOrganizationMembersPage({
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

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  if (!isAdmin) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="mb-4">No tienes acceso a esta sección.</p>
          <Link href="/dashboard" className="underline text-sm">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  const { data: organizations } = await supabase.rpc("list_organizations");
  const organization = (organizations as OrganizationRow[] | null)?.find(
    (org) => org.id === id
  );

  const { data: members } = await supabase.rpc("list_organization_members", {
    p_org_id: id,
  });

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">
          {organization?.name || "Empresa"} — empleados
        </h1>
        <Link href="/admin" className="text-sm underline text-gray-600">
          Volver a empresas
        </Link>
      </div>

      {!members || members.length === 0 ? (
        <p className="text-sm text-gray-500">Esta empresa todavía no tiene empleados.</p>
      ) : (
        <ul className="flex flex-col divide-y border rounded">
          {(members as MemberRow[]).map((member) => (
            <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{member.full_name || member.email}</p>
                <p className="text-gray-500">
                  {member.email} · {member.department_name || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {member.is_supervisor && (
                  <span className="text-xs rounded-full bg-gray-100 px-2 py-1">supervisor</span>
                )}
                {member.is_manager && (
                  <span className="text-xs rounded-full bg-gray-100 px-2 py-1">jefe</span>
                )}
                <span
                  className={
                    "text-xs rounded-full px-2 py-1 " +
                    (member.status === "active"
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700")
                  }
                >
                  {member.status === "active" ? "activo" : "invitado"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
