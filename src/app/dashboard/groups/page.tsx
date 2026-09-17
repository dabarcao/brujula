import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import Card from "@/components/ui/Card";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";
import { FormattedParagraphs } from "@/components/FormattedText";

export default async function ReportGroupsPage() {
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();

  const isCompany = currentMember?.organization?.kind === "company";

  if (!currentMember || currentMember.status !== "active" || !isCompany) {
    redirect("/dashboard");
  }

  const [groups, introText] = await Promise.all([
    reportGroupsManager.getMyReportGroups(),
    feedbackManager.getPlatformText(
      "report_groups_intro",
      "Un informe de grupo junta el 360 ya finalizado de varias personas en una sola vista agregada. Cualquiera con su propio 360 finalizado puede crear uno e invitar a compañeros que también lo tengan; el informe se genera cuando todos los invitados han aceptado."
    ),
  ]);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Informes de grupo</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      <div className="text-sm text-ink-soft mb-6 flex flex-col gap-3">
        <FormattedParagraphs text={introText} />
      </div>

      {/*
        Un <Link> no puede ser hijo de <ButtonPrimary> (renderiza un
        <button>, y <button> dentro de <a> es contenido inválido para el
        modelo de contenido de <a> -- rompe el orden de tabulación y
        confunde a lectores de pantalla). En su lugar, este Link usa
        `buttonPrimaryClassName`, exportado por ButtonPrimary.tsx, para
        quedar visualmente idéntico sin anidar dos elementos interactivos
        y sin duplicar la cadena de clases a mano.
      */}
      <Link
        href="/dashboard/groups/nuevo"
        className={`inline-block mb-6 ${buttonPrimaryClassName}`}
      >
        Crear grupo
      </Link>

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">
            No estás en ningún grupo todavía, ni como creador ni invitado.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="-m-6 divide-y divide-line">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <span>
                  {g.name}
                  <span className="text-ink-soft">
                    {" "}
                    — {g.status === "closed" ? "cerrado" : "abierto"} ({g.acceptedCount} de{" "}
                    {g.totalCount} aceptados)
                    {g.myStatus === "pending" && " · te falta responder"}
                  </span>
                </span>
                <Link href={`/dashboard/groups/${g.id}`} className="underline text-ink shrink-0">
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
