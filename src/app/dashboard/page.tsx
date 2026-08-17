import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

const SUBTYPE_LABELS: Record<string, string> = {
  general: "general / desarrollo profesional",
  meeting: "reunión / presentación",
  collaboration: "colaboración",
  leadership_initiative: "liderazgo de iniciativa",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // El Admin general de plataforma no pertenece a ninguna empresa (sección 2
  // de la spec): esta comprobación va primero y es excluyente, para que
  // nunca se le trate como Supervisor de una empresa aunque quedara alguna
  // fila antigua de "members" asociada a su email.
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (isPlatformAdmin) {
    redirect("/admin");
  }

  let { data: member } = await supabase
    .from("members")
    .select("id, is_supervisor, organization_id, organizations(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Primera vez que este usuario entra tras confirmar su correo: resuelve lo
  // que quedó pendiente al invitarle (alta de empleado, ver
  // 0003_member_invites.sql). El alta de empresa ya no pasa por aquí — la
  // hace el Admin general desde /admin (ver 0016_platform_admin_org_creation.sql).
  if (!member) {
    const pendingInviteToken = user.user_metadata?.pending_invite_token as
      | string
      | undefined;

    if (pendingInviteToken) {
      const { error } = await supabase.rpc("accept_member_invite", {
        p_token: pendingInviteToken,
      });

      if (!error) {
        const { data: refreshedMember } = await supabase
          .from("members")
          .select("id, is_supervisor, organization_id, organizations(name)")
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
          <form action={signOut} className="mt-4">
            <button className="underline text-sm">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  const orgName = (member.organizations as unknown as { name: string } | null)?.name;

  const { data: pendingInvitations } = await supabase
    .from("feedback_invitations")
    .select("token, created_at, evaluator_category, feedback_requests(requester_member_id)")
    .eq("invitee_member_id", member.id)
    .is("used_at", null)
    .order("created_at");

  const requesterIds = Array.from(
    new Set(
      (pendingInvitations || [])
        .map(
          (invitation) =>
            (invitation.feedback_requests as unknown as { requester_member_id: string } | null)
              ?.requester_member_id
        )
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: requesters } = requesterIds.length
    ? await supabase.from("members").select("id, full_name, email").in("id", requesterIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };

  const requesterById = new Map((requesters || []).map((r) => [r.id, r]));

  const { data: myRequests } = await supabase
    .from("feedback_requests")
    .select("id, created_at, request_type, subtype, status")
    .eq("requester_member_id", member.id)
    .order("created_at", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);

  // Solo los ciclos donde este empleado fue seleccionado como participante
  // por el Supervisor (feedback_cycle_participants), no todos los de la
  // empresa — ver 0017_supervisor_and_admin_management.sql.
  const { data: participantRows } = await supabase
    .from("feedback_cycle_participants")
    .select("feedback_cycles(id, name, opens_at, closes_at)")
    .eq("member_id", member.id);

  const openCycles = (
    (participantRows || [])
      .map(
        (row) =>
          row.feedback_cycles as unknown as {
            id: string;
            name: string;
            opens_at: string;
            closes_at: string;
          } | null
      )
      .filter((cycle): cycle is NonNullable<typeof cycle> => Boolean(cycle))
      .filter((cycle) => cycle.opens_at <= today && today <= cycle.closes_at)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
  );

  const { data: myCycleRequests } = await supabase
    .from("feedback_requests")
    .select("id, cycle_id")
    .eq("requester_member_id", member.id)
    .eq("request_type", "cycle");

  const cycleRequestByCycleId = new Map(
    (myCycleRequests || []).map((r) => [r.cycle_id, r.id])
  );

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
        {member.is_supervisor ? " (administrador)" : ""}.
      </p>

      <div className="flex gap-4 mt-4">
        {member.is_supervisor && (
          <>
            <Link href="/dashboard/members" className="text-sm underline text-gray-700">
              Gestionar empleados
            </Link>
            <Link href="/dashboard/cycles/nueva" className="text-sm underline text-gray-700">
              Crear ciclo 360
            </Link>
          </>
        )}
        <Link href="/dashboard/feedback/nueva" className="text-sm underline text-gray-700">
          Pedir feedback
        </Link>
      </div>

      {openCycles && openCycles.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Ciclos 360 abiertos</h2>
          <ul className="border rounded divide-y">
            {openCycles.map((cycle) => {
              const myRequestId = cycleRequestByCycleId.get(cycle.id);
              return (
                <li
                  key={cycle.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span>{cycle.name}</span>
                  <Link
                    href={
                      myRequestId
                        ? `/dashboard/feedback/${myRequestId}`
                        : `/dashboard/cycles/${cycle.id}`
                    }
                    className="underline text-gray-700"
                  >
                    {myRequestId ? "Ver progreso" : "Organizar evaluadores"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Tareas pendientes</h2>
        {!pendingInvitations || pendingInvitations.length === 0 ? (
          <p className="text-sm text-gray-500">No tienes feedback pendiente de dar.</p>
        ) : (
          <ul className="border rounded divide-y">
            {pendingInvitations.map((invitation) => {
              const requesterId = (
                invitation.feedback_requests as unknown as { requester_member_id: string } | null
              )?.requester_member_id;
              const requester = requesterId ? requesterById.get(requesterId) : undefined;
              const isSelf = invitation.evaluator_category === "self";
              return (
                <li
                  key={invitation.token}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span>
                    {isSelf ? (
                      "Tu autoevaluación"
                    ) : (
                      <>
                        Feedback para{" "}
                        <strong>
                          {requester?.full_name || requester?.email || "un compañero"}
                        </strong>
                      </>
                    )}
                  </span>
                  <Link
                    href={`/responder/${invitation.token}`}
                    className="underline text-gray-700"
                  >
                    Responder
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Mis solicitudes</h2>
        {!myRequests || myRequests.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no has pedido feedback.</p>
        ) : (
          <ul className="border rounded divide-y">
            {myRequests.map((request) => (
              <li key={request.id} className="px-4 py-3 text-sm">
                <Link href={`/dashboard/feedback/${request.id}`} className="underline">
                  Solicitud del {new Date(request.created_at).toLocaleDateString("es-ES")}
                  {request.request_type === "cycle"
                    ? " (ciclo 360)"
                    : ` (${SUBTYPE_LABELS[request.subtype ?? "general"]})`}
                  {request.status === "closed" && request.request_type === "ad_hoc"
                    ? " — cerrada"
                    : ""}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
