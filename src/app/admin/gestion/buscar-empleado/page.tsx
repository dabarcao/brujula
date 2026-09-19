import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as adminManager from "@/server/managers/adminManager";
import { findMemberAsAdmin } from "@/app/actions/admin";
import { signOut } from "@/app/actions/auth";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";
import PermissionDenied from "@/components/ui/PermissionDenied";

export default async function AdminBuscarEmpleadoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = await adminManager.checkIsPlatformAdmin();

  if (!isAdmin) {
    return <PermissionDenied message="No tienes acceso a esta sección." />;
  }

  return (
    <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Buscar empleado por email</h1>
        <div className="flex items-center gap-4">
          <Link href="/admin/gestion" className="text-sm underline text-ink-soft">
            Volver a Gestión Brújula
          </Link>
          <form action={signOut}>
            <button className="text-sm underline text-ink-soft">Cerrar sesión</button>
          </form>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <p className="text-sm text-ink-soft mb-6">
        Busca por email a cualquier empleado, sea de una empresa o de una cuenta
        individual (estas últimas no aparecen en el listado de &ldquo;Empresas&rdquo;). Te
        lleva directo a su ficha, donde puedes corregir su nombre y su email.
      </p>

      <form
        action={findMemberAsAdmin}
        className="flex items-center gap-2 bg-paper-deep rounded-brujula-lg shadow-card p-6"
      >
        <input
          name="searchEmail"
          type="email"
          required
          placeholder="email@ejemplo.com"
          className="border border-line rounded-brujula-sm px-3 py-2 text-sm flex-1 bg-paper-deep text-ink"
        />
        <ButtonPrimary type="submit" className="px-4 py-2 whitespace-nowrap">
          Buscar
        </ButtonPrimary>
      </form>
    </main>
  );
}
