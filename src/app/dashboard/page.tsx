import Link from "next/link";
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
    .select("id, is_supervisor, organization_id, organizations(name, kind)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Primera vez que este usuario entra tras confirmar su correo: resuelve lo
  // que quedó pendiente al invitarle (alta de empleado, ver
  // 0003_member_invites.sql). El alta de empresa ya no pasa por aquí — la
  // hace el Admin general desde /admin (ver 0016_platform_admin_org_creation.sql).
  let bootstrapError: string | null = null;

  if (!member) {
    const pendingInviteToken = user.user_metadata?.pending_invite_token as
      | string
      | undefined;
    const pendingIndividualSignup = user.user_metadata?.pending_individual_signup as
      | boolean
      | undefined;

    if (pendingInviteToken) {
      const { error } = await supabase.rpc("accept_member_invite", {
        p_token: pendingInviteToken,
      });

      if (error) {
        bootstrapError = error.message;
      } else {
        const { data: refreshedMember } = await supabase
          .from("members")
          .select("id, is_supervisor, organization_id, organizations(name, kind)")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        member = refreshedMember;
      }
    } else if (pendingIndividualSignup) {
      // No se relee "members" después de crearla: se vio en pruebas
      // reales que esa relectura, en la misma petición, a veces no veía
      // todavía la fila recién insertada (el primer intento fallaba en
      // silencio, el segundo ya funcionaba). La función ya devuelve
      // directamente todo lo necesario para pintar la página.
      const fullName = (user.user_metadata?.full_name as string | undefined) || "";
      const { data: created, error } = await supabase
        .rpc("create_individual_account", {
          p_full_name: fullName,
          p_email: user.email,
        })
        .single();

      const createdRow = created as unknown as {
        member_id: string;
        organization_id: string;
        organization_name: string;
        organization_kind: string;
        is_supervisor: boolean;
      } | null;

      if (error) {
        bootstrapError = error.message;
      } else if (createdRow) {
        member = {
          id: createdRow.member_id,
          is_supervisor: createdRow.is_supervisor,
          organization_id: createdRow.organization_id,
          organizations: { name: createdRow.organization_name, kind: createdRow.organization_kind },
        } as unknown as typeof member;
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
          {bootstrapError && (
            <p className="mb-4 rounded bg-red-50 text-red-700 text-sm p-3">{bootstrapError}</p>
          )}
          <form action={signOut} className="mt-4">
            <button className="underline text-sm">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  // Une a este member cualquier invitación por email que coincida con su
  // propio email y siga sin responder (sección 4.2/4.3) — se comprueba en
  // cada visita, no solo al darse de alta, para cubrir también el caso de
  // recibir una invitación por email después de ya tener cuenta.
  await supabase.rpc("claim_pending_email_invitations");

  const org = member.organizations as unknown as { name: string; kind: string } | null;
  const orgName = org?.name;
  const isIndividual = org?.kind === "individual";

  // No se puede montar esto con un select normal + embed a
  // feedback_requests: quien te invita puede pertenecer a otra
  // organización (una cuenta individual invitando a otra), y
  // "feedback_requests scoped to organization" deja ese campo en null en
  // cuanto cruza de organización. Una sola función que ya devuelve todo
  // resuelto, sin depender de ningún embed sujeto a esa política.
  const { data: pendingInvitationsData } = await supabase.rpc("get_my_pending_invitations");
  const pendingInvitations =
    (pendingInvitationsData as
      | {
          token: string;
          created_at: string;
          evaluator_category: string | null;
          requester_member_id: string;
          requester_full_name: string | null;
          requester_email: string;
        }[]
      | null) || [];

  const { data: myRequests } = await supabase
    .from("feedback_requests")
    .select("id, created_at, request_type, status, name, closes_at, feedback_cycles(name)")
    .eq("requester_member_id", member.id)
    .order("created_at", { ascending: false });

  // Cerrado ya no es "todavía en curso" (sección 4.1: cerrar es siempre una
  // acción explícita) — se separan en dos listas para no mezclar lo que
  // sigue vivo con lo que ya quedó fijado.
  const openRequests = (myRequests || []).filter((r) => r.status !== "closed");
  const closedRequests = (myRequests || []).filter((r) => r.status === "closed");

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

  // Un ciclo ya organizado (tiene su propia feedback_request) sale en
  // "Mis feedbacks en curso" más abajo — aquí solo se listan los que
  // todavía necesitan que organices tus evaluadores, para no duplicar la
  // misma entrada en dos sitios.
  const cyclesToOrganize = openCycles.filter((cycle) => !cycleRequestByCycleId.get(cycle.id));

  // Informes de grupo son solo empresa (sección 17) — ni se consulta para
  // una cuenta individual.
  let pendingGroups: { id: string; name: string }[] = [];
  if (!isIndividual) {
    const { data: groupsData } = await supabase.rpc("get_my_report_groups");
    pendingGroups = (
      (groupsData as { id: string; name: string; my_status: string | null }[] | null) || []
    )
      .filter((g) => g.my_status === "pending")
      .map((g) => ({ id: g.id, name: g.name }));
  }

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
        {member.is_supervisor && !isIndividual ? " (administrador)" : ""}.
      </p>

      <div className="flex flex-wrap gap-2.5 mt-5">
        <Link
          href="/dashboard/feedback/nueva"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Pedir feedback
        </Link>
        {isIndividual && (
          <Link
            href="/dashboard/feedback/nueva-360"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Pedir feedback 360
          </Link>
        )}
        <Link
          href="/dashboard/mi-mapa"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
        >
          Mi mapa de competencias
        </Link>
        {!isIndividual && (
          <Link
            href="/dashboard/groups"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Informes de grupo
          </Link>
        )}
        {member.is_supervisor && !isIndividual && (
          <>
            <Link
              href="/dashboard/members"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Gestionar empleados
            </Link>
            <Link
              href="/dashboard/cycles"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Ciclos 360
            </Link>
            <Link
              href="/dashboard/informe-empresa"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Mapa de competencias de la empresa
            </Link>
          </>
        )}
      </div>

      {cyclesToOrganize.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Ciclos 360 abiertos</h2>
          <ul className="border rounded divide-y">
            {cyclesToOrganize.map((cycle) => (
              <li key={cycle.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Ciclo 360 {cycle.name}</span>
                <Link href={`/dashboard/cycles/${cycle.id}`} className="underline text-gray-700">
                  Organizar evaluadores
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Tareas pendientes</h2>
        {pendingGroups.length === 0 && (!pendingInvitations || pendingInvitations.length === 0) ? (
          <p className="text-sm text-gray-500">No tienes feedback pendiente de dar.</p>
        ) : (
          <ul className="border rounded divide-y">
            {pendingGroups.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  Te han invitado al grupo <strong>{g.name}</strong>
                </span>
                <Link href={`/dashboard/groups/${g.id}`} className="underline text-gray-700 shrink-0">
                  Ver e ir a confirmar
                </Link>
              </li>
            ))}
            {pendingInvitations?.map((invitation) => {
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
                          {invitation.requester_full_name ||
                            invitation.requester_email ||
                            "un compañero"}
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
        <h2 className="text-sm font-medium text-gray-700 mb-3">Mis feedbacks en curso</h2>
        {openRequests.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no has pedido feedback.</p>
        ) : (
          <ul className="border rounded divide-y">
            {openRequests.map((request) => {
              const isCycle = request.request_type === "cycle";
              const cycleName = (request.feedback_cycles as unknown as { name: string } | null)
                ?.name;
              // "Ciclo 360 " / "Feedback ágil " es siempre el prefijo, igual
              // que en feedback/[id]/page.tsx.
              const fallbackDate = `del ${new Date(request.created_at).toLocaleDateString("es-ES")}`;
              const label = isCycle
                ? `Ciclo 360 ${cycleName || request.name || fallbackDate}`
                : `Feedback ágil ${request.name || fallbackDate}`;
              return (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>{label}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    {isCycle && (
                      <Link
                        href={`/dashboard/feedback/${request.id}/gestionar`}
                        className="underline text-gray-600"
                      >
                        Gestionar evaluadores
                      </Link>
                    )}
                    <Link href={`/dashboard/feedback/${request.id}`} className="underline">
                      {isCycle ? "Ver informe" : "Ver"}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Mis feedbacks cerrados</h2>
        {closedRequests.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no has cerrado ningún feedback.</p>
        ) : (
          <ul className="border rounded divide-y">
            {closedRequests.map((request) => {
              const isCycle = request.request_type === "cycle";
              const cycleName = (request.feedback_cycles as unknown as { name: string } | null)
                ?.name;
              const fallbackDate = `del ${new Date(request.created_at).toLocaleDateString("es-ES")}`;
              const label = isCycle
                ? `Ciclo 360 ${cycleName || request.name || fallbackDate}`
                : `Feedback ágil ${request.name || fallbackDate}`;
              return (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    {label}
                    {request.closes_at && (
                      <span className="text-gray-400"> — cerrado el {request.closes_at}</span>
                    )}
                  </span>
                  <Link href={`/dashboard/feedback/${request.id}`} className="underline shrink-0">
                    {isCycle ? "Ver informe" : "Ver"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
