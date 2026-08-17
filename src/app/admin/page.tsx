import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrganizationAsAdmin, updateOrganizationName } from "@/app/actions/admin";
import { signOut } from "@/app/actions/auth";

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
  supervisor_email: string | null;
  supervisor_status: string | null;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    createdEmail?: string;
    createdOrg?: string;
  }>;
}) {
  const { error, created, createdEmail, createdOrg } = await searchParams;
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

  let inviteUrl: string | null = null;
  if (created) {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    inviteUrl = `${protocol}://${host}/invitacion/${created}`;
  }

  const { data: organizations } = await supabase.rpc("list_organizations");

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Administración de plataforma</h1>
        <form action={signOut}>
          <button className="text-sm underline text-gray-600">Cerrar sesión</button>
        </form>
      </div>

      <div className="flex gap-4 mb-8 text-sm">
        <span className="underline text-gray-700">Empresas</span>
        <span className="text-gray-400" title="Todavía no disponible">
          Cuestionarios
        </span>
        <span className="text-gray-400" title="Todavía no disponible">
          Competencias
        </span>
      </div>

      {inviteUrl && (
        <div className="mb-6 rounded bg-blue-50 text-blue-700 text-sm p-3">
          <p className="mb-2">
            Empresa <strong>{createdOrg}</strong> creada. Comparte este link con{" "}
            <strong>{createdEmail}</strong> para que complete su alta como
            administrador (todavía no enviamos emails automáticamente):
          </p>
          <input
            readOnly
            value={inviteUrl}
            className="w-full border rounded px-2 py-1 text-xs bg-white"
          />
        </div>
      )}

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      <form
        action={createOrganizationAsAdmin}
        className="flex flex-col gap-3 border rounded p-4"
      >
        <p className="text-sm font-medium">Crear empresa</p>
        <input
          name="orgName"
          type="text"
          required
          placeholder="Nombre de la empresa"
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          name="adminFullName"
          type="text"
          placeholder="Nombre del primer administrador (opcional)"
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          name="adminEmail"
          type="email"
          required
          placeholder="Email del primer administrador"
          className="border rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 self-start"
        >
          Crear
        </button>
      </form>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Empresas</h2>
        {!organizations || organizations.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay empresas creadas.</p>
        ) : (
          <ul className="flex flex-col divide-y border rounded">
            {(organizations as OrganizationRow[]).map((org) => (
              <li key={org.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <form action={updateOrganizationName} className="flex items-center gap-2 flex-1">
                  <input type="hidden" name="orgId" value={org.id} />
                  <input
                    name="newName"
                    defaultValue={org.name}
                    className="border rounded px-2 py-1 text-sm flex-1"
                  />
                  <button type="submit" className="text-xs underline text-gray-600">
                    Guardar
                  </button>
                </form>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {org.supervisor_email
                    ? `${org.supervisor_email} (${org.supervisor_status === "active" ? "activo" : "invitado"})`
                    : "sin administrador"}
                </span>
                <Link
                  href={`/admin/empresas/${org.id}`}
                  className="text-xs underline text-gray-600 whitespace-nowrap"
                >
                  Ver empleados
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
