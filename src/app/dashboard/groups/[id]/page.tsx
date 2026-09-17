import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import {
  closeReportGroup,
  addReportGroupMembers,
  removeReportGroupMember,
} from "@/app/actions/reportGroups";
import CompetencyComparisonChart from "@/components/CompetencyComparisonChart";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import Card from "@/components/ui/Card";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import AggregateBadge from "@/components/ui/AggregateBadge";
import PendingInviteActions from "./PendingInviteActions";
import AcceptAcknowledgment from "./AcceptAcknowledgment";

const MEMBER_STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  accepted: "aceptado",
  rejected: "rechazado",
};

export default async function ReportGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // get_report_group (the RPC reportGroupsManager.getGroup wraps) always
  // raises rather than returning null/empty data -- both "not found" and
  // "no access" are SQL exceptions (supabase/migrations/0064_report_groups.sql),
  // never a silent empty result. The original inline call redirected on
  // EITHER an RPC error OR falsy data; since the manager only ever throws
  // (or returns a populated ReportGroupDetail) for this RPC, a catch-and-
  // redirect reproduces that exact "silent redirect to /dashboard" behavior
  // with no separate not-found branch needed.
  let group;
  try {
    group = await reportGroupsManager.getGroup(id);
  } catch {
    redirect("/dashboard");
  }

  // acceptedCount/canClose/allAccepted/meetsMinimumSize/readyToClose/
  // canSeeReport/canManageMembers now come pre-computed from
  // reportGroupsManager.getGroup (src/server/db/reportGroups.ts) instead
  // of being derived here -- see that file for the eligibility/threshold
  // rules (canSeeReport in particular: a pending/rejected invitee never
  // can see the aggregate, even once the group closes --
  // get_report_group_competency_summary would reject them anyway, so it's
  // never called for them).
  // meetsMinimumSize isn't read directly here: `!readyToClose` combined
  // with `allAccepted` already implies it (readyToClose = allAccepted &&
  // meetsMinimumSize) for the two-branch message below.
  const { acceptedCount, canClose, allAccepted, readyToClose, canSeeReport, canManageMembers } = group;

  // Candidatos para "invitar a más gente": mismos elegibles que la
  // pantalla de creación (cyclesManager.getColleaguesWithClosedCycle --
  // ver ese archivo's own comment de por qué vive ahí y no en
  // reportGroupsManager), menos quien ya está en este grupo (en
  // cualquier estado -- add_report_group_members ya ignora en silencio a
  // quien ya está pending/accepted, así que no hace falta duplicar esa
  // regla aquí, esto es solo para no ofrecer una opción inútil en el
  // desplegable).
  let addableColleagues: { id: string; email: string; full_name: string | null }[] = [];
  if (canManageMembers) {
    try {
      const currentMemberIds = new Set(group.members.map((m) => m.memberId));
      const colleagues = await cyclesManager.getColleaguesWithClosedCycle();
      addableColleagues = colleagues
        .filter((c) => !currentMemberIds.has(c.id))
        .map((c) => ({ id: c.id, email: c.email, full_name: c.fullName }));
    } catch {
      addableColleagues = [];
    }
  }

  let competencySummary: Awaited<
    ReturnType<typeof reportGroupsManager.getGroupCompetencySummary>
  > = [];
  if (group.status === "closed" && canSeeReport) {
    // El original ignoraba cualquier error de esta segunda llamada (solo
    // desestructuraba `data`, sin comprobar `error`) y quedaba con `[]` --
    // el manager, en cambio, lanza. Se envuelve en try/catch para
    // reproducir exactamente ese swallow silencioso.
    try {
      competencySummary = await reportGroupsManager.getGroupCompetencySummary(id);
    } catch {
      competencySummary = [];
    }
  }
  const aiInterpretation = group.aiInterpretation;

  // Igual que el comparativo individual (sección 9): la media de los
  // evaluadores como gajo de color, la media de la propia
  // autopercepción del grupo como línea — nunca dos gráficas sueltas.
  const comparisonAxes = competencySummary.map((row) => ({
    code: row.competencyCode,
    name: row.competencyName,
    groupCode: row.roleCode || "plenitud",
    selfValue: row.selfAvgValue,
    peerAvgValue: row.peerAvgValue,
  }));

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-ink-soft mb-6">
        Informe de grupo — {group.status === "closed" ? "cerrado" : "abierto"}
      </p>

      {error && (
        // Sin coral: DESIGN.md reserva coral para un único momento
        // energizante por pantalla, nunca para error/warning, y no existe
        // todavía un componente de alerta dedicado -- caja neutra
        // border-line/text-ink en su lugar (spec-2-6, Never).
        <p className="mb-6 rounded-brujula-md border border-line text-ink text-sm p-3">
          {error}
        </p>
      )}

      <AcceptAcknowledgment groupId={id} isAccepted={group.myStatus === "accepted"} />

      {group.myStatus === "pending" && (
        <Card className="mb-6">
          <p className="text-sm text-ink mb-3">
            Te han invitado a este grupo. ¿Quieres formar parte?
          </p>
          <PendingInviteActions groupId={id} />
        </Card>
      )}

      {group.status === "open" ? (
        <>
          <p className="text-sm text-ink-soft mb-4">
            {acceptedCount} de {group.members.length} aceptados
            {/* El informe solo se genera cuando TODOS hayan aceptado -- no
                un mínimo, ver close_report_group
                (0099_report_groups_membership_management_and_email.sql).
                Este texto lo deja claro incluso cuando ya se ha llegado al
                suelo de anonimato (meetsMinimumSize), para no dar a
                entender que "ya se puede cerrar" antes de tiempo. */}
            {!allAccepted && " — el informe se genera cuando todos hayan aceptado"}.
          </p>
          <Card className="mb-6 overflow-hidden">
            <ul className="-m-6 divide-y divide-line">
              {group.members.map((m) => (
                <li
                  key={m.memberId}
                  className="flex items-center justify-between gap-3 px-6 py-3 text-sm"
                >
                  <span>{m.fullName || m.email}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-ink-soft">
                      {MEMBER_STATUS_LABELS[m.status] || m.status}
                    </span>
                    {/* Quitar del grupo: pensado para quien no responde o
                        rechazó, para poder llegar al 100% con el resto --
                        el RPC en sí permite quitar a cualquiera
                        (remove_report_group_member no distingue por
                        estado), pero solo se ofrece el botón aquí para
                        pending/rejected: a alguien ya aceptado no tiene
                        sentido quitarlo desde esta pantalla sin más
                        contexto. */}
                    {canManageMembers && m.status !== "accepted" && (
                      <form action={removeReportGroupMember}>
                        <input type="hidden" name="groupId" value={id} />
                        <input type="hidden" name="memberId" value={m.memberId} />
                        <button type="submit" className="text-xs underline text-ink-soft">
                          Quitar
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {canManageMembers && addableColleagues.length > 0 && (
            <Card className="mb-6">
              <p className="text-sm text-ink mb-4">Invitar a más gente</p>
              <form action={addReportGroupMembers} className="flex flex-col gap-4">
                <input type="hidden" name="groupId" value={id} />
                <EvaluatorPicker
                  colleagues={addableColleagues}
                  checkboxName="memberId"
                  minSelected={1}
                  submitLabel="Invitar"
                />
              </form>
            </Card>
          )}

          {canClose && (
            <form action={closeReportGroup}>
              <input type="hidden" name="groupId" value={id} />
              <ButtonPrimary type="submit" disabled={!readyToClose}>
                Cerrar informe
              </ButtonPrimary>
              {!readyToClose && (
                <p className="text-xs text-ink-soft mt-2">
                  {!allAccepted
                    ? "Todavía hay invitados que no han aceptado. Espera a que respondan, o quítalos del grupo si hace falta."
                    : "Hacen falta al menos 5 personas en el grupo para poder cerrarlo."}
                </p>
              )}
            </form>
          )}
        </>
      ) : !canSeeReport ? (
        <Card>
          <p className="text-sm text-ink-soft">
            Este grupo se cerró antes de que confirmaras tu participación,
            así que no forma parte del agregado ni puedes ver el informe.
          </p>
        </Card>
      ) : (
        <>
          {aiInterpretation && (
            <Card className="mb-8">
              <p className="text-xs font-semibold text-ink-soft mb-2">
                Interpretación del grupo{" "}
                <span className="font-normal text-ink-soft">(generado por IA)</span>
              </p>
              <div className="text-sm text-ink flex flex-col gap-3 whitespace-pre-line">
                {aiInterpretation}
              </div>
            </Card>
          )}

          <div className="flex justify-center">
            {/* Story 7.2: el informe de grupo no tiene un "tú" único --
                etiquetas propias en vez de reutilizar las del informe
                individual ("Tú"/"Media") sin más sentido. */}
            <CompetencyComparisonChart
              axes={comparisonAxes}
              categorySeries={[]}
              selfLabel="Auto-percepción (equipo)"
              peerLabel="Evaluadores"
            />
          </div>

          <div className="flex flex-col items-center gap-2 mt-6">
            <AggregateBadge className="px-4 py-1.5">
              Vista agregada — {acceptedCount} personas
            </AggregateBadge>
            <p className="text-xs text-ink-soft text-center">
              El color es la media de cómo les evalúan sus compañeros, la
              línea es la media de su propia autopercepción — cada una con
              los datos de su último 360 finalizado.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
