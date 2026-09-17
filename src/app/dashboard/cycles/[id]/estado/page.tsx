import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import type { CycleStatusRow } from "@/server/managers/cyclesManager";
import Card from "@/components/ui/Card";
import ErrorBanner from "@/components/ui/ErrorBanner";

// Nunca rojo/ámbar/verde para estados de progreso (DESIGN.md, la rampa de
// intensidad es indigo-only a propósito) -- una progresión neutro -> lavado
// -> indigo sólido en vez de un semáforo.
const STATUS_LABELS: Record<CycleStatusRow["status"], { label: string; className: string }> = {
  no_iniciado: { label: "No iniciado", className: "bg-surface-2 text-ink-soft" },
  en_progreso: { label: "En progreso", className: "bg-indigo-wash text-indigo-deep" },
  completado: { label: "Completado", className: "bg-indigo text-paper-deep" },
};

export default async function CycleStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const member = await membersManager.getCurrentMember();

  if (!member || !member.isSupervisor) {
    redirect("/dashboard");
  }

  const cycle = await cyclesManager.getCycleById(id);

  if (!cycle) {
    redirect("/dashboard/cycles");
  }

  let rows: CycleStatusRow[] = [];
  let errorMessage: string | null = null;
  try {
    rows = await cyclesManager.getStatus(id);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Ciclo 360 {cycle.name}</h1>
        <Link href="/dashboard/cycles" className="text-sm underline text-ink-soft">
          Volver a ciclos
        </Link>
      </div>

      <p className="text-sm text-ink-soft mb-6">
        {cycle.opensAt} → {cycle.closesAt}
      </p>

      {errorMessage && <ErrorBanner>{errorMessage}</ErrorBanner>}

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Este ciclo todavía no tiene participantes.</p>
        </Card>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm border border-line rounded-brujula-md overflow-hidden">
            <thead>
              <tr className="bg-surface-2 text-left text-xs text-ink-soft">
                <th className="px-4 py-2 font-medium">Empleado</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-paper-deep">
              {rows.map((row) => {
                const status = STATUS_LABELS[row.status];
                return (
                  <tr key={row.memberId}>
                    <td className="px-4 py-2 text-ink">{row.fullName || row.email}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-caption text-caption rounded-full px-2 py-0.5 ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
