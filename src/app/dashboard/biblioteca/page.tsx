import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompetencyModelDiagram from "@/components/CompetencyModelDiagram";

type FrameworkRow = {
  code: string;
  name: string;
  description: string | null;
  role: { code: string } | null;
};

export default async function BibliotecaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rolesData } = await supabase
    .from("competency_roles")
    .select("code, name, description")
    .order("position");

  const { data: frameworksData } = await supabase
    .from("competency_frameworks")
    .select("code, name, description, role:competency_roles(code)")
    .order("name");

  const { data: plenitudData } = await supabase
    .from("competency_principles")
    .select("description")
    .eq("code", "wholeness")
    .maybeSingle();

  const { data: tealData } = await supabase
    .from("competency_principles")
    .select("name, description")
    .eq("code", "organizacion_teal")
    .maybeSingle();

  const roles = (rolesData as { code: string; name: string; description: string | null }[]) || [];
  const frameworks = ((frameworksData as unknown as FrameworkRow[]) || []).map((f) => ({
    code: f.code,
    name: f.name,
    description: f.description,
    groupCode: f.role?.code || "plenitud",
  }));

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Biblioteca</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        El modelo de competencias de Brújula: Plenitud y los cuatro roles VACC, con las 15
        competencias que los componen.
      </p>

      <CompetencyModelDiagram
        frameworkIntro={
          tealData?.description ? { name: tealData.name, description: tealData.description } : null
        }
        frameworks={frameworks}
        roles={roles}
        plenitudDescription={plenitudData?.description || ""}
      />
    </main>
  );
}
