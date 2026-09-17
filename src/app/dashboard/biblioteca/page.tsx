import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import CompetencyModelDiagram from "@/components/CompetencyModelDiagram";
import { FormattedInline } from "@/components/FormattedText";

// Story 7.3: full competency model as a browsable reference page --
// available to every signed-in member, Invitado included (Story 7.4's own
// AC: an Invitado can see the Biblioteca, just never request/be a subject
// of feedback -- see dashboard/page.tsx's unconditional link, no
// `!member.isGuest` guard). Reads only platform-wide catalogs
// (competency_frameworks/competency_principles/competency_roles, all
// "readable by anyone authenticated", not org-scoped) through
// membersManager -- no membersManager.getCurrentMember() call needed here,
// unlike most other dashboard pages, since nothing rendered is
// member/org-specific. All copy is DB-driven (platform_texts for the intro
// paragraph, the 3 catalogs for everything else) -- no hardcoded text.
export default async function BibliotecaPage() {
  const user = await authManager.getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [frameworks, principles, roles, introText] = await Promise.all([
    membersManager.listCompetencyFrameworks(),
    membersManager.listCompetencyPrinciples(),
    membersManager.listCompetencyRoles(),
    feedbackManager.getPlatformText(
      "biblioteca_intro",
      "El modelo de competencias de Brújula: Plenitud y los cuatro roles VACC, con las competencias que los componen."
    ),
  ]);

  const teal = principles.find((p) => p.code === "organizacion_teal");
  const plenitud = principles.find((p) => p.code === "wholeness");

  const diagramFrameworks = frameworks.map((f) => ({
    code: f.code,
    name: f.name,
    description: f.description,
    thresholdHigh: f.thresholdHigh,
    thresholdLow: f.thresholdLow,
    groupCode: f.role?.code || "plenitud",
  }));

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-ink">Biblioteca</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-ink-soft mb-6">
        <FormattedInline text={introText} />
      </p>

      <CompetencyModelDiagram
        frameworkIntro={teal ? { name: teal.name, description: teal.description || "" } : null}
        frameworks={diagramFrameworks}
        roles={roles}
        plenitudDescription={plenitud?.description || ""}
      />
    </main>
  );
}
