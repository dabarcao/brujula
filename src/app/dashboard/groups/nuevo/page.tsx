import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import { createReportGroup } from "@/app/actions/reportGroups";
import EvaluatorPicker from "@/components/EvaluatorPicker";
import Card from "@/components/ui/Card";
import { FormattedParagraphs } from "@/components/FormattedText";

export default async function NewReportGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentMember = await membersManager.getCurrentMember();

  const isCompany = currentMember?.organization?.kind === "company";

  if (!currentMember || currentMember.status !== "active" || !isCompany) {
    redirect("/dashboard");
  }

  const [colleagues, introText] = await Promise.all([
    cyclesManager.getColleaguesWithClosedCycle(),
    feedbackManager.getPlatformText(
      "report_group_creation_intro",
      "Elige a quién invitar. Cada uno recibirá un email avisándole de que le has invitado a este grupo, y podrá aceptar o rechazar — el informe se genera cuando todos hayan aceptado. Solo aparecen compañeros que ya tienen su propio 360 finalizado."
    ),
  ]);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Nuevo informe de grupo</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      <div className="text-sm text-ink-soft mb-6 flex flex-col gap-3">
        <FormattedParagraphs text={introText} />
      </div>

      {error && (
        // Sin coral: DESIGN.md reserva coral para un único momento
        // energizante por pantalla, nunca para error/warning, y no existe
        // todavía un componente de alerta dedicado -- caja neutra
        // border-line/text-ink en su lugar (spec-2-6, Never).
        <p className="mb-6 rounded-brujula-md border border-line text-ink text-sm p-3">
          {error}
        </p>
      )}

      {colleagues.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">
            Todavía no hay compañeros con un 360 ya finalizado. En cuanto
            alguien finalice el suyo, podrás invitarle aquí.
          </p>
        </Card>
      ) : (
        <Card>
          <form action={createReportGroup} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Nombre del grupo
              <input
                name="name"
                type="text"
                required
                placeholder="Equipo de ventas"
                className="border border-line rounded-brujula-md px-3 py-2"
              />
            </label>

            <EvaluatorPicker
              colleagues={colleagues.map((c) => ({
                id: c.id,
                email: c.email,
                full_name: c.fullName,
              }))}
              checkboxName="memberId"
              minSelected={1}
              submitLabel="Crear grupo"
              primary
            />
          </form>
        </Card>
      )}
    </main>
  );
}
