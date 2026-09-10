import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { respondToReportGroup, closeReportGroup } from "@/app/actions/reportGroups";
import CompetencyComparisonChart from "@/components/CompetencyComparisonChart";

type GroupMember = {
  member_id: string;
  full_name: string | null;
  email: string;
  status: "pending" | "accepted" | "rejected";
};

type GroupDetail = {
  id: string;
  name: string;
  status: "open" | "closed";
  is_creator: boolean;
  my_status: "pending" | "accepted" | "rejected" | null;
  ai_interpretation: string | null;
  members: GroupMember[];
};

type CompetencySummaryRow = {
  competency_code: string;
  competency_name: string;
  role_code: string | null;
  role_name: string | null;
  peer_avg_value: number | null;
  self_avg_value: number | null;
  member_count: number;
};

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: groupData, error: groupError } = await supabase.rpc("get_report_group", {
    p_group_id: id,
  });

  if (groupError || !groupData) {
    redirect("/dashboard");
  }

  const group = groupData as unknown as GroupDetail;
  const acceptedCount = group.members.filter((m) => m.status === "accepted").length;
  const canClose = group.status === "open" && group.my_status === "accepted";

  // Un pendiente/rechazado nunca puede ver el agregado, aunque el grupo
  // ya esté cerrado — get_report_group_competency_summary lo rechazaría,
  // así que ni se llama (evita una excepción sin capturar).
  const canSeeReport = group.is_creator || group.my_status === "accepted";

  let competencySummary: CompetencySummaryRow[] = [];
  if (group.status === "closed" && canSeeReport) {
    const { data: summaryData } = await supabase.rpc("get_report_group_competency_summary", {
      p_group_id: id,
    });
    competencySummary = (summaryData as CompetencySummaryRow[] | null) || [];
  }
  const aiInterpretation = group.ai_interpretation;

  // Igual que el comparativo individual (sección 9): la media de los
  // evaluadores como gajo de color, la media de la propia
  // autopercepción del grupo como línea — nunca dos gráficas sueltas.
  const comparisonAxes = competencySummary.map((row) => ({
    code: row.competency_code,
    name: row.competency_name,
    groupCode: row.role_code || "plenitud",
    selfValue: row.self_avg_value,
    peerAvgValue: row.peer_avg_value,
  }));

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        <Link href="/dashboard" className="text-sm underline text-gray-600">
          Volver al panel
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Informe de grupo — {group.status === "closed" ? "cerrado" : "abierto"}
      </p>

      {error && (
        <p className="mb-6 rounded bg-red-50 text-red-700 text-sm p-3">{error}</p>
      )}

      {group.my_status === "pending" && (
        <div className="mb-6 border rounded p-4">
          <p className="text-sm mb-3">
            Te han invitado a este grupo. ¿Quieres formar parte?
          </p>
          <div className="flex gap-3">
            <form action={respondToReportGroup}>
              <input type="hidden" name="groupId" value={id} />
              <input type="hidden" name="accept" value="true" />
              <button
                type="submit"
                className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800"
              >
                Confirmar
              </button>
            </form>
            <form action={respondToReportGroup}>
              <input type="hidden" name="groupId" value={id} />
              <input type="hidden" name="accept" value="false" />
              <button type="submit" className="text-sm underline text-gray-600">
                Rechazar
              </button>
            </form>
          </div>
        </div>
      )}

      {group.status === "open" ? (
        <>
          <p className="text-sm text-gray-600 mb-4">
            {acceptedCount} de {group.members.length} aceptados.
          </p>
          <ul className="border rounded divide-y mb-6">
            {group.members.map((m) => (
              <li
                key={m.member_id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>{m.full_name || m.email}</span>
                <span className="text-xs text-gray-400">
                  {MEMBER_STATUS_LABELS[m.status] || m.status}
                </span>
              </li>
            ))}
          </ul>

          {canClose && (
            <form action={closeReportGroup}>
              <input type="hidden" name="groupId" value={id} />
              <button
                type="submit"
                disabled={acceptedCount < 5}
                className="bg-black text-white rounded px-4 py-2 text-sm hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Cerrar informe
              </button>
              {acceptedCount < 5 && (
                <p className="text-xs text-gray-400 mt-2">
                  Hacen falta al menos 5 personas aceptadas para poder cerrarlo.
                </p>
              )}
            </form>
          )}
        </>
      ) : !canSeeReport ? (
        <p className="text-sm text-gray-500">
          Este grupo se cerró antes de que confirmaras tu participación, así
          que no forma parte del agregado ni puedes ver el informe.
        </p>
      ) : (
        <>
          {aiInterpretation && (
            <div className="mb-8 border rounded-lg p-4 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 mb-2">
                Interpretación del grupo{" "}
                <span className="font-normal text-gray-400">(generado por IA)</span>
              </p>
              <div className="text-sm text-gray-700 flex flex-col gap-3 whitespace-pre-line">
                {aiInterpretation}
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <CompetencyComparisonChart
              axes={comparisonAxes}
              categorySeries={[]}
              selfLabel="Auto-percepción (equipo)"
              peerLabel="Evaluadores"
            />
          </div>

          <p className="text-xs text-gray-400 mt-6">
            {acceptedCount} personas aportan a este agregado — el color es
            la media de cómo les evalúan sus compañeros, la línea es la
            media de su propia autopercepción — cada una con los datos de
            su último 360 finalizado.
          </p>
        </>
      )}
    </main>
  );
}
