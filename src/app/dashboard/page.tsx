import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { checkIsPlatformAdmin } from "@/server/managers/adminManager";
import { getCurrentUserWithMetadata } from "@/server/managers/authManager";
import {
  acceptInvite,
  claimPendingInvitations,
  getCurrentMember,
  createIndividualAccount,
  type CurrentMember,
} from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import type { PendingInvitation, MyPendingRequestSummaryRow } from "@/server/managers/feedbackManager";
import Card from "@/components/ui/Card";
import { buttonSecondaryClassName } from "@/components/ui/ButtonSecondary";
import ErrorBanner from "@/components/ui/ErrorBanner";

// Story 7.4 (ports the "tareas pendientes distingue tipo real" portion of
// upstream commit 62e2ed8): único subtipo ad-hoc realmente construido hoy es
// "competencias" (pantalla de creación, SubtypeFieldset en
// feedback/nueva/page.tsx) -- el resto son legado ya retirado de esa
// pantalla. Nunca inventar una etiqueta genérica tipo "ágil" para una
// invitación pendiente -- mostrar siempre el subtipo real (360, o el
// subtype real del ad-hoc), aunque sea uno legado.
const AD_HOC_SUBTYPE_LABELS: Record<string, string> = {
  competencias: "por competencias",
  general: "general",
  meeting: "de una reunión",
  collaboration: "de una colaboración",
  leadership_initiative: "de una iniciativa",
};

// Every read below goes through its manager (adminManager/authManager/
// membersManager for the admin/members/auth domain; feedbackManager/
// cyclesManager/reportGroupsManager for the read-only reports domain), each
// call wrapped in try/catch, falling back to the same empty state an
// unchecked-`error` RPC result would have produced.
//
// Dashboard audit fix: myRequests's ad_hoc + cycle merge/sort (previously
// built at this page despite this comment's own former claim that it
// already ran "through the manager layer per Story 3.26") now genuinely
// lives in feedbackManager.getMyPendingRequestsSummary() -- including that
// function's own Promise.allSettled (one source failing must not blank out
// the other's already-succeeded rows, see that function's own doc comment).
//
// Story 7.2: the en-curso/cerrado split itself (and each closed request's
// real close date) is likewise never recomputed here -- this page calls
// feedbackManager.getMyFeedbackRequestsByStatus() (a thin sibling of
// getMyPendingRequestsSummary(), same underlying merged/sorted rows) and
// renders its two already-decided lists (openRequests/closedRequests)
// as-is. Same class of leak the dashboard audit above already fixed once
// in this file -- see that function's own doc comment in feedbackManager.ts.
//
// Likewise, cyclesToOrganize's open-cycles-minus-already-organized
// cross-reference now lives in
// cyclesManager.getCyclesNeedingOrganization() ("which cycles need action
// from me" is a real business rule, not display formatting -- see that
// function's own doc comment). This page now just renders each manager's
// already-composed result; neither of these two reads shares a fetch with
// the other anymore, so each keeps its own independent try/catch.
//
// pendingGroups stays a page-level filter of reportGroupsManager.
// getMyReportGroups() (`myStatus === "pending"`): a plain, already-correct
// enum field on an already-correct list, used only to decide which of two
// UI sections a group renders in -- not a permission/eligibility decision,
// so judged acceptable presentation logic rather than business logic
// (checked every use of pendingGroups in this file to confirm it's never
// used for anything but that rendering split).
//
// get_my_pending_invitations now goes through
// feedbackManager.getMyPendingInvitations() (matches this page's own old
// raw RPC call exactly); create_individual_account now goes through
// membersManager.createIndividualAccount().

export default async function DashboardPage() {
  // getCurrentUserWithMetadata() (not the plain getCurrentUser()) because
  // the bootstrap block below reads the three `user_metadata` fields the
  // plain, "every page" getCurrentUser() deliberately doesn't carry -- see
  // db/auth.ts's own comment on why that's a separate function.
  const user = await getCurrentUserWithMetadata();

  if (!user) {
    redirect("/login");
  }

  // El Admin general de plataforma no pertenece a ninguna empresa (sección 2
  // de la spec): esta comprobación va primero y es excluyente, para que
  // nunca se le trate como Supervisor de una empresa aunque quedara alguna
  // fila antigua de "members" asociada a su email.
  let isPlatformAdmin: boolean | null;
  try {
    isPlatformAdmin = await checkIsPlatformAdmin();
  } catch {
    // An RPC failure here falls through as "not a platform admin" instead
    // of crashing the render.
    isPlatformAdmin = false;
  }
  if (isPlatformAdmin) {
    redirect("/admin");
  }

  let member: CurrentMember | null = await getCurrentMember();

  // Primera vez que este usuario entra tras confirmar su correo: resuelve lo
  // que quedó pendiente al invitarle (alta de empleado, ver
  // 0003_member_invites.sql). El alta de empresa ya no pasa por aquí — la
  // hace el Admin general desde /admin (ver 0016_platform_admin_org_creation.sql).
  let bootstrapError: string | null = null;

  if (!member) {
    const pendingInviteToken = user.pendingInviteToken;
    const pendingIndividualSignup = user.pendingIndividualSignup;

    if (pendingInviteToken) {
      try {
        await acceptInvite(pendingInviteToken);
        member = await getCurrentMember();
      } catch (e) {
        bootstrapError = e instanceof Error ? e.message : String(e);
      }
    } else if (pendingIndividualSignup) {
      // No se relee "members" después de crearla: se vio en pruebas
      // reales que esa relectura, en la misma petición, a veces no veía
      // todavía la fila recién insertada (el primer intento fallaba en
      // silencio, el segundo ya funcionaba). La función ya devuelve
      // directamente todo lo necesario para pintar la página.
      const fullName = user.fullName || "";
      try {
        const created = await createIndividualAccount(fullName, user.email || "");
        member = {
          id: created.memberId,
          fullName,
          isSupervisor: created.isSupervisor,
          // create_individual_account never creates an Invitado -- the
          // individual-account flow always makes its one member the
          // Supervisor of their own organization (mutually exclusive with
          // is_guest by the members_not_supervisor_and_guest constraint,
          // supabase/migrations/0076_guest_member_type.sql).
          isGuest: false,
          organizationId: created.organizationId,
          // Siempre 'active' por construcción de create_individual_account
          // (0041_individual_account_returns_member.sql) -- no viene en las
          // columnas que devuelve la RPC.
          status: "active",
          organization: { name: created.organizationName, kind: created.organizationKind },
        };
      } catch (e) {
        bootstrapError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  if (!member) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center flex flex-col items-center gap-4">
          <p className="text-sm text-ink">
            Tu cuenta todavía no está asociada a ninguna organización.
          </p>
          {bootstrapError && <ErrorBanner>{bootstrapError}</ErrorBanner>}
          <form action={signOut}>
            <button className="text-sm underline text-ink-soft">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  // Une a este member cualquier invitación por email que coincida con su
  // propio email y siga sin responder (sección 4.2/4.3) — se comprueba en
  // cada visita, no solo al darse de alta, para cubrir también el caso de
  // recibir una invitación por email después de ya tener cuenta.
  try {
    await claimPendingInvitations();
  } catch {
    // Fire-and-forget.
  }

  const org = member.organization;
  const orgName = org?.name;
  const isIndividual = org?.kind === "individual";

  // No se puede montar esto con un select normal + embed a
  // feedback_requests: quien te invita puede pertenecer a otra
  // organización (una cuenta individual invitando a otra), y
  // "feedback_requests scoped to organization" deja ese campo en null en
  // cuanto cruza de organización. Una sola función que ya devuelve todo
  // resuelto, sin depender de ningún embed sujeto a esa política.
  let pendingInvitations: PendingInvitation[] = [];
  try {
    pendingInvitations = await feedbackManager.getMyPendingInvitations();
  } catch {
    pendingInvitations = [];
  }

  // Dashboard audit fix (Finding 4) + Story 7.2: merge/sort AND the en-
  // curso/cerrado split now both live in feedbackManager (see this page's
  // own header comment and getMyFeedbackRequestsByStatus's own doc
  // comment) -- the underlying getMyPendingRequestsSummary() never throws
  // (handling the ad_hoc/cycle partial-failure case internally), so this
  // try/catch is defense-in-depth only, same defaulting-to-empty shape as
  // every other read on this page.
  let openRequests: MyPendingRequestSummaryRow[] = [];
  let closedRequests: MyPendingRequestSummaryRow[] = [];
  try {
    const requestsByStatus = await feedbackManager.getMyFeedbackRequestsByStatus();
    openRequests = requestsByStatus.open;
    closedRequests = requestsByStatus.closed;
  } catch {
    openRequests = [];
    closedRequests = [];
  }

  // Dashboard audit fix (Finding 2): the open-cycles-minus-already-organized
  // cross-reference now lives in cyclesManager.getCyclesNeedingOrganization()
  // -- see this page's own header comment and that function's own doc
  // comment. Solo los ciclos donde este empleado fue seleccionado como
  // participante por el Supervisor (feedback_cycle_participants), no todos
  // los de la empresa — ver 0017_supervisor_and_admin_management.sql.
  let cyclesToOrganize: { id: string; name: string }[] = [];
  try {
    cyclesToOrganize = await cyclesManager.getCyclesNeedingOrganization();
  } catch {
    cyclesToOrganize = [];
  }

  // Informes de grupo son solo empresa (sección 17) — ni se consulta para
  // una cuenta individual.
  let pendingGroups: { id: string; name: string }[] = [];
  if (!isIndividual) {
    try {
      const groups = await reportGroupsManager.getMyReportGroups();
      pendingGroups = groups
        .filter((g) => g.myStatus === "pending")
        .map((g) => ({ id: g.id, name: g.name }));
    } catch {
      pendingGroups = [];
    }
  }

  return (
    <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">{orgName}</h1>
        <form action={signOut}>
          <button className="text-sm underline text-ink-soft">Cerrar sesión</button>
        </form>
      </div>

      <p className="text-sm text-ink-soft">
        Sesión iniciada como <strong className="text-ink">{user.email}</strong>
        {member.isSupervisor && !isIndividual ? " (administrador)" : ""}
        {member.isGuest ? " (invitado)" : ""}.
      </p>

      <div className="flex flex-wrap gap-3 mt-5">
        {/* Story 7.4: un Invitado nunca puede pedir feedback (ni ágil ni
            360) -- solo responder cuando se lo piden. Reforzado también en
            el RPC (create_ad_hoc_feedback_request/create_feedback_cycle),
            esto es solo la interfaz. */}
        {!member.isGuest && (
          <Link href="/dashboard/feedback/nueva" className={buttonSecondaryClassName}>
            Pedir feedback
          </Link>
        )}
        {isIndividual && !member.isGuest && (
          <Link href="/dashboard/feedback/nueva-360" className={buttonSecondaryClassName}>
            Pedir feedback 360
          </Link>
        )}
        {/* Story 7.4: un Invitado nunca es sujeto de un ciclo 360 (nunca es
            evaluado, solo evalúa), así que tampoco tiene mapa de
            competencias propio -- se oculta el link. */}
        {!member.isGuest && (
          <Link href="/dashboard/mi-mapa" className={buttonSecondaryClassName}>
            Mi mapa de competencias
          </Link>
        )}
        {/* Story 7.3: la Biblioteca (modelo de competencias completo) es la
            única sección que un Invitado sí puede ver -- sin guard
            `!member.isGuest`, a propósito (Story 7.4's own AC). */}
        <Link href="/dashboard/biblioteca" className={buttonSecondaryClassName}>
          Biblioteca
        </Link>
        {!isIndividual && (
          <Link href="/dashboard/groups" className={buttonSecondaryClassName}>
            Informes de grupo
          </Link>
        )}
        {member.isSupervisor && !isIndividual && (
          <>
            <Link href="/dashboard/members" className={buttonSecondaryClassName}>
              Gestionar empleados
            </Link>
            <Link href="/dashboard/cycles" className={buttonSecondaryClassName}>
              Ciclos 360
            </Link>
            <Link href="/dashboard/informe-empresa" className={buttonSecondaryClassName}>
              Mapa de competencias de la empresa
            </Link>
          </>
        )}
      </div>

      {/* 2026-09-17: en línea, como "Tareas pendientes" -- ya no en tarjetas
          grandes (CardAccent en grid), que se veían desproporcionadas
          frente al resto del panel para lo que es una sola tarea más. Sin
          color de fondo tampoco (pedido explícito), mismo estilo neutro
          que el resto de filas del panel. */}
      {cyclesToOrganize.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-ink-soft mb-3">Ciclos 360 abiertos</h2>
          <Card className="overflow-hidden">
            <ul className="-m-6 divide-y divide-line">
              {cyclesToOrganize.map((cycle) => (
                <li
                  key={cycle.id}
                  className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                >
                  <span className="text-ink">Ciclo 360 — {cycle.name}</span>
                  <Link
                    href={`/dashboard/cycles/${cycle.id}`}
                    className="underline text-ink shrink-0"
                  >
                    Organizar evaluadores
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-soft mb-3">Tareas pendientes</h2>
        {pendingGroups.length === 0 && (!pendingInvitations || pendingInvitations.length === 0) ? (
          <p className="text-sm text-ink-soft">
            {member.isGuest
              ? "Todavía no tienes feedback pendiente de responder"
              : "No tienes feedback pendiente de dar."}
          </p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="-m-6 divide-y divide-line">
              {pendingGroups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                >
                  <span className="text-ink">Informe de grupo — {g.name}</span>
                  {/* Story 7.2: ya no confirma/rechaza a ciegas desde aquí --
                      enlaza a la página del propio grupo, donde se ve con
                      quién más se está aceptando antes de decidir. */}
                  <Link href={`/dashboard/groups/${g.id}`} className="underline text-ink shrink-0">
                    Ver y responder
                  </Link>
                </li>
              ))}
              {pendingInvitations?.map((invitation) => {
                const isSelf = invitation.evaluatorCategory === "self";
                // Story 7.4: distingue el tipo/subtipo real de feedback en
                // vez de la etiqueta genérica "Feedback ágil" que se
                // mostraba siempre, para un 360 o un ad-hoc por igual --
                // ver este archivo's AD_HOC_SUBTYPE_LABELS y la migración
                // 0075_pending_invitations_subtype.sql.
                const isCycle = invitation.requestType === "cycle";
                const subtypeLabel = isCycle
                  ? "360"
                  : AD_HOC_SUBTYPE_LABELS[invitation.subtype || ""] || invitation.subtype || "ágil";
                const who = isSelf
                  ? "Tu autoevaluación"
                  : invitation.requesterFullName || invitation.requesterEmail || "un compañero";
                return (
                  <li
                    key={invitation.token}
                    className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                  >
                    <span className="text-ink">
                      Feedback {subtypeLabel} — {who}
                    </span>
                    <Link href={`/responder/${invitation.token}`} className="underline text-ink shrink-0">
                      Responder
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-soft mb-3">Mis feedbacks en curso</h2>
        {openRequests.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no has pedido feedback.</p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="-m-6 divide-y divide-line">
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
                    className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                  >
                    <span className="text-ink">{label}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      {isCycle && (
                        <Link
                          href={`/dashboard/feedback/${request.id}/gestionar`}
                          className="underline text-ink-soft"
                        >
                          Gestionar evaluadores
                        </Link>
                      )}
                      <Link href={`/dashboard/feedback/${request.id}`} className="underline text-ink">
                        {isCycle ? "Ver informe" : "Ver"}
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Story 7.2: separada de "en curso" -- antes un feedback ya cerrado
          se mezclaba con los abiertos, con solo una etiqueta " — cerrada"
          para un ad_hoc (un 360 cerrado ni eso tenía). openRequests/
          closedRequests ya vienen decididos por
          feedbackManager.getMyFeedbackRequestsByStatus(), ver el comentario
          de cabecera de esta página. */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-soft mb-3">Mis feedbacks cerrados</h2>
        {closedRequests.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no has cerrado ningún feedback.</p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="-m-6 divide-y divide-line">
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
                    className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                  >
                    <span className="text-ink">
                      {label}
                      {request.closesAt && (
                        <span className="text-ink-soft"> — cerrado el {request.closesAt}</span>
                      )}
                    </span>
                    <Link href={`/dashboard/feedback/${request.id}`} className="underline text-ink shrink-0">
                      {isCycle ? "Ver informe" : "Ver"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}
