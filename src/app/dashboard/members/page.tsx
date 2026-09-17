import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { inviteMember, createDepartment } from "@/app/actions/members";
import { getCurrentUser } from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import Card from "@/components/ui/Card";
import AggregateBadge from "@/components/ui/AggregateBadge";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ButtonSecondary from "@/components/ui/ButtonSecondary";
import ErrorBanner from "@/components/ui/ErrorBanner";
import PermissionDenied from "@/components/ui/PermissionDenied";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invited?: string; invitedEmail?: string }>;
}) {
  const { error, invited, invitedEmail } = await searchParams;

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();

  if (!currentMember) {
    redirect("/dashboard");
  }

  if (!currentMember.isSupervisor) {
    return <PermissionDenied message="Solo un administrador puede gestionar los empleados." />;
  }

  let memberList: membersManager.MyOrganizationMemberRow[] = [];
  try {
    memberList = await membersManager.listMyOrganizationMembers();
  } catch {
    memberList = [];
  }

  let departmentList: membersManager.Department[] = [];
  try {
    departmentList = await membersManager.listDepartments();
  } catch {
    departmentList = [];
  }

  const departmentById = new Map(departmentList.map((d) => [d.id, d]));

  let inviteUrl: string | null = null;
  if (invited) {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    inviteUrl = `${protocol}://${host}/invitacion/${invited}`;
  }

  return (
    <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      {inviteUrl && (
        <div className="mb-6 rounded-brujula-md bg-indigo-wash text-ink text-sm p-3">
          <p className="mb-2">
            Invitación creada para <strong>{invitedEmail}</strong>. Comparte este link con
            esa persona para que complete su alta (todavía no enviamos emails
            automáticamente):
          </p>
          <input
            readOnly
            value={inviteUrl}
            className="w-full border border-line rounded-brujula-sm px-2 py-1 text-xs bg-paper-deep text-ink"
          />
        </div>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <form
        action={inviteMember}
        className="flex flex-col gap-3 bg-paper-deep rounded-brujula-lg shadow-card p-6 mb-4"
      >
        <p className="text-sm font-medium text-ink">Invitar a un nuevo empleado</p>
        <div className="flex gap-3">
          <input
            name="fullName"
            type="text"
            placeholder="Nombre (opcional)"
            className="border border-line rounded-brujula-sm px-3 py-2 text-sm flex-1 bg-paper-deep text-ink"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="email@empresa.com"
            className="border border-line rounded-brujula-sm px-3 py-2 text-sm flex-1 bg-paper-deep text-ink"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            name="departmentId"
            required
            defaultValue=""
            className="border border-line rounded-brujula-sm px-3 py-2 text-sm flex-1 bg-paper-deep text-ink"
          >
            <option value="" disabled>
              Departamento
            </option>
            {departmentList.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <ButtonPrimary type="submit">Invitar</ButtonPrimary>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="isGuest" className="mt-0.5" />
          <span>
            Invitado — solo puede responder feedback cuando se lo pidan y ver la
            Biblioteca; no puede pedir feedback ni tiene mapa de competencias
            propio.
          </span>
        </label>
      </form>

      <form action={createDepartment} className="flex gap-3 mb-8 items-center">
        <input
          name="name"
          type="text"
          required
          placeholder="Nuevo departamento (ej. Ventas)"
          className="border border-line rounded-brujula-sm px-3 py-2 text-sm flex-1 bg-paper-deep text-ink"
        />
        <ButtonSecondary type="submit" className="px-4 py-2 whitespace-nowrap">
          Crear departamento
        </ButtonSecondary>
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
            <p className="text-sm text-ink-soft">Todavía no hay empleados.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberList.map((member) => (
              <Card key={member.id} className="flex flex-col gap-2 overflow-hidden">
                <div>
                  <p className="font-medium text-ink truncate">{member.fullName || member.email}</p>
                  <p className="text-xs text-ink-soft break-words">
                    {member.email} · {departmentById.get(member.departmentId)?.name || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {member.isSupervisor && (
                    <span className="text-xs rounded-full bg-surface-2 text-ink-soft px-2 py-1">
                      admin
                    </span>
                  )}
                  {member.isGuest && (
                    <span className="text-xs rounded-full bg-coral-wash text-coral-deep px-2 py-1">
                      invitado
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
                  {member.status === "invited" && (
                    <Link
                      href={
                        `/dashboard/members?invited=${encodeURIComponent(member.inviteToken)}` +
                        `&invitedEmail=${encodeURIComponent(member.email)}`
                      }
                      className="text-xs underline text-ink-soft"
                    >
                      Ver link
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
