import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as membersManager from "@/server/managers/membersManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import Card from "@/components/ui/Card";
import { buttonPrimaryClassName } from "@/components/ui/ButtonPrimary";

export default async function CyclesListPage() {
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const member = await membersManager.getCurrentMember();

  if (!member || !member.isSupervisor) {
    redirect("/dashboard");
  }

  const cycles = await cyclesManager.listOrganizationCycles(member.organizationId);

  const openCycles = cycles.filter((cycle) => !cycle.isClosed);
  const closedCycles = cycles.filter((cycle) => cycle.isClosed);

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Ciclos 360</h1>
        <Link href="/dashboard" className="text-sm underline text-ink-soft">
          Volver al panel
        </Link>
      </div>

      <div className="mb-6">
        <Link href="/dashboard/cycles/nueva" className={buttonPrimaryClassName}>
          Crear ciclo 360
        </Link>
      </div>

      {cycles.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Todavía no has creado ningún ciclo 360.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-ink mb-2">Ciclos abiertos</h2>
            {openCycles.length === 0 ? (
              <p className="text-sm text-ink-soft">No hay ciclos abiertos ahora mismo.</p>
            ) : (
              <Card className="overflow-hidden">
                <ul className="-m-6 divide-y divide-line">
                  {openCycles.map((cycle) => (
                    <li key={cycle.id} className="px-6 py-3 text-sm">
                      <Link
                        href={`/dashboard/cycles/${cycle.id}/estado`}
                        className="underline text-ink"
                      >
                        Ciclo 360 {cycle.name}
                      </Link>
                      <span className="text-ink-soft">
                        {" "}
                        · {cycle.opensAt} → {cycle.closesAt}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink mb-2">Ciclos cerrados</h2>
            {closedCycles.length === 0 ? (
              <p className="text-sm text-ink-soft">No hay ciclos cerrados todavía.</p>
            ) : (
              <Card className="overflow-hidden">
                <ul className="-m-6 divide-y divide-line">
                  {closedCycles.map((cycle) => (
                    <li key={cycle.id} className="px-6 py-3 text-sm">
                      <Link
                        href={`/dashboard/cycles/${cycle.id}/estado`}
                        className="underline text-ink"
                      >
                        Ciclo 360 {cycle.name}
                      </Link>
                      <span className="text-ink-soft">
                        {" "}
                        · {cycle.opensAt} → {cycle.closesAt}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
