import Link from "next/link";
import { redirect } from "next/navigation";
import * as authManager from "@/server/managers/authManager";
import * as adminManager from "@/server/managers/adminManager";
import { signOut } from "@/app/actions/auth";
import { buttonSecondaryClassName } from "@/components/ui/ButtonSecondary";
import PermissionDenied from "@/components/ui/PermissionDenied";

export default async function AdminGestionPage() {
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
        <h1 className="text-2xl font-semibold">Gestión Brújula</h1>
        <form action={signOut}>
          <button className="text-sm underline text-ink-soft">Cerrar sesión</button>
        </form>
      </div>

      <div className="flex gap-4 mb-8 text-sm">
        <Link href="/admin" className="text-ink-soft hover:text-ink hover:underline">
          Empresas
        </Link>
        <span className="text-ink-soft" title="Todavía no disponible">
          Cuestionarios
        </span>
        <span className="text-ink-soft" title="Todavía no disponible">
          Competencias
        </span>
        <span className="underline text-ink">Gestión Brújula</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/gestion/buscar-empleado" className={buttonSecondaryClassName}>
          Buscar empleado por email
        </Link>
      </div>
    </main>
  );
}
