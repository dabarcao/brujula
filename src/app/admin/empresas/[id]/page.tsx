import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateOrganizationName } from "@/app/actions/admin";
import { signOut } from "@/app/actions/auth";
import Card from "@/components/ui/Card";
import AggregateBadge from "@/components/ui/AggregateBadge";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";
import PermissionDenied from "@/components/ui/PermissionDenied";

type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { id } = await params;
  const { error, updated } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  if (!isAdmin) {
    return <PermissionDenied message="No tienes acceso a esta sección." />;
  }

  const { data: organizations } = await supabase.rpc("list_organizations");
  const organization = (organizations as OrganizationRow[] | null)?.find(
    (org) => org.id === id
  );

  const { data: members } = await supabase.rpc("list_organization_members", {
    p_org_id: id,
  });
  const memberList = (members as MemberRow[] | null) || [];

  return (
    <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">{organization?.name || "Empresa"}</h1>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm underline text-ink-soft">
            Volver a empresas
          </Link>
          <form action={signOut}>
            <button className="text-sm underline text-ink-soft">Cerrar sesión</button>
          </form>
        </div>
      </div>

      {updated && (
        <div className="mb-6 rounded-brujula-md bg-indigo-wash text-ink text-sm p-3">
          Empresa actualizada.
        </div>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <form
        action={updateOrganizationName}
        className="flex items-center gap-2 bg-paper-deep rounded-brujula-lg shadow-card p-6 mb-8"
      >
        <input type="hidden" name="orgId" value={id} />
        <input
          name="newName"
          defaultValue={organization?.name}
          className="border border-line rounded-brujula-sm px-2 py-1 text-sm flex-1 bg-paper-deep text-ink"
        />
        <ButtonPrimary type="submit" className="px-4 py-2 whitespace-nowrap">
          Guardar nombre
        </ButtonPrimary>
      </form>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-medium text-ink-soft">Empleados</h2>
          {memberList.length > 0 && (
            <AggregateBadge className="px-3 py-1">
              Vista agregada — {memberList.length} {memberList.length === 1 ? "empleado" : "empleados"}
            </AggregateBadge>
          )}
        </div>

        {memberList.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">Esta empresa todavía no tiene empleados.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberList.map((member) => (
              <Card key={member.id} className="flex flex-col gap-2 overflow-hidden">
                <div>
                  <p className="font-medium text-ink truncate">{member.full_name || member.email}</p>
                  <p className="text-xs text-ink-soft break-words">
                    {member.email} · {member.department_name || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {member.is_supervisor && (
                    <span className="text-xs rounded-full bg-surface-2 text-ink-soft px-2 py-1">
                      supervisor
                    </span>
                  )}
                  <span
                    className={
                      "text-xs rounded-full px-2 py-1 " +
                      (member.status === "active"
                        ? "bg-indigo-wash text-ink"
                        : "bg-surface-2 text-ink-soft")
                    }
                  >
                    {member.status === "active" ? "activo" : "invitado"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
