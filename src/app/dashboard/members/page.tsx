import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviteMember, createDepartment } from "@/app/actions/members";

type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  is_manager: boolean;
  is_supervisor: boolean;
  department_id: string;
  invite_token: string;
  created_at: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invited?: string; invitedEmail?: string }>;
}) {
  const { error, invited, invitedEmail } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentMember } = await supabase
    .from("members")
    .select("id, is_supervisor, organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!currentMember) {
    redirect("/dashboard");
  }

  if (!currentMember.is_supervisor) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="mb-4">Solo un administrador puede gestionar los empleados.</p>
          <Link href="/dashboard" className="underline text-sm">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  const { data: members } = await supabase
    .from("members")
    .select("id, email, full_name, status, is_manager, is_supervisor, department_id, invite_token, created_at")
    .order("created_at");

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  const departmentById = new Map((departments as DepartmentRow[] | null)?.map((d) => [d.id, d]));

  let inviteUrl: string | null = null;
  if (invited) {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    inviteUrl = `${protocol}://${host}/invitacion/${invited}`;
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>

      {inviteUrl && (
        <div className="mb-6 rounded bg-blue-50 text-blue-700 text-sm p-3">
          <p className="mb-2">
            Invitación creada para <strong>{invitedEmail}</strong>. Comparte este link con
            esa persona para que complete su alta (todavía no enviamos emails
            automáticamente):
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

      <form action={inviteMember} className="flex flex-col gap-3 mb-4 border rounded p-4">
        <p className="text-sm font-medium">Invitar a un nuevo empleado</p>
        <div className="flex gap-3">
          <input
            name="fullName"
            type="text"
            placeholder="Nombre (opcional)"
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="email@empresa.com"
            className="border rounded px-3 py-2 text-sm flex-1"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            name="departmentId"
            required
            defaultValue=""
            className="border rounded px-3 py-2 text-sm flex-1"
          >
            <option value="" disabled>
              Departamento
            </option>
            {(departments as DepartmentRow[] | null)?.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="isManager" />
            Es responsable de equipo
          </label>
          <button
            type="submit"
            className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
          >
            Invitar
          </button>
        </div>
      </form>

      <form action={createDepartment} className="flex gap-3 mb-8 items-center">
        <input
          name="name"
          type="text"
          required
          placeholder="Nuevo departamento (ej. Ventas)"
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        <button type="submit" className="text-sm underline text-gray-700">
          Crear departamento
        </button>
      </form>

      <ul className="flex flex-col divide-y border rounded">
        {(members as MemberRow[] | null)?.map((member) => (
          <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{member.full_name || member.email}</p>
              <p className="text-gray-500">
                {member.email} · {departmentById.get(member.department_id)?.name || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {member.is_supervisor && (
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">admin</span>
              )}
              {member.is_manager && (
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">responsable</span>
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
              {member.status === "invited" && (
                <Link
                  href={
                    `/dashboard/members?invited=${encodeURIComponent(member.invite_token)}` +
                    `&invitedEmail=${encodeURIComponent(member.email)}`
                  }
                  className="text-xs underline text-gray-600"
                >
                  Ver link
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
