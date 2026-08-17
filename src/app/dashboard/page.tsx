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

  let { data: member } = await supabase
    .from("members")
    .select("id, role, organization_id, organizations(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Primera vez que este usuario entra tras confirmar su correo: resolvemos
  // lo que quedó pendiente al registrarse — o bien crear la organización
  // (alta de empresa), o bien vincularse a un "members" que RRHH ya creó
  // al invitarle (alta de empleado, ver 0003_member_invites.sql).
  if (!member) {
    const pendingOrgName = user.user_metadata?.pending_org_name as
      | string
      | undefined;
    const pendingInviteToken = user.user_metadata?.pending_invite_token as
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
    } else if (pendingInviteToken) {
      const { error } = await supabase.rpc("accept_member_invite", {
        p_token: pendingInviteToken,
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

  const { data: openCycles } = await supabase
    .from("feedback_cycles")
    .select("id, name, opens_at, closes_at")
    .lte("opens_at", today)
    .gte("closes_at", today)
    .order("opens_at");

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
        {member.role === "org_admin" ? " (administrador)" : ""}.
      </p>

      <div className="flex gap-4 mt-4">
        {member.role === "org_admin" && (
          <>
            <Link href="/dashboard/members" className="text-sm underline text-gray-700">
              Gestionar empleados
            </Link>
            <Link href="/dashboard/cycles/nueva" className="text-sm underline text-gray-700">
              Crear ciclo 360
            </Link>
            <Link href="/dashboard/questionnaires" className="text-sm underline text-gray-700">
              Cuestionarios
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
