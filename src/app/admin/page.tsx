import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrganizationAsAdmin } from "@/app/actions/admin";
import { signOut } from "@/app/actions/auth";
import Card from "@/components/ui/Card";
import AggregateBadge from "@/components/ui/AggregateBadge";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ErrorBanner from "@/components/ui/ErrorBanner";
import PermissionDenied from "@/components/ui/PermissionDenied";
import Pagination from "@/components/ui/Pagination";

// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): page size for the
// paginated `list_organizations()` RPC call below.
const PAGE_SIZE = 24;

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
  supervisor_email: string | null;
  supervisor_status: string | null;
  total_count: number;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    createdEmail?: string;
    createdOrg?: string;
    page?: string | string[];
  }>;
}) {
  const { error, created, createdEmail, createdOrg, page: pageParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  if (!isAdmin) {
    return <PermissionDenied message="No tienes acceso a esta sección." />;
  }

  let inviteUrl: string | null = null;
  if (created) {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    inviteUrl = `${protocol}://${host}/invitacion/${created}`;
  }

  // Story 6.1: requested page, defaulting to 1 for a missing/malformed
  // `?page=` value (never NaN/0/negative/fractional). A repeated `?page=`
  // query param comes back as string[] -- take the first value, same as
  // Next.js's own resolution for a single-value field.
  const pageParamValue = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const rawPage = Number(pageParamValue);
  let page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const { data: firstFetch, error: firstFetchError } = await supabase.rpc("list_organizations", {
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (firstFetchError) throw new Error(firstFetchError.message);
  let orgList = (firstFetch as OrganizationRow[] | null) || [];
  let totalCount = orgList[0]?.total_count ?? 0;

  // `?page=` beyond the last valid page (or the set shrank since the link
  // was generated) yields zero rows -- and with zero rows, `count(*)
  // over()` never ran, so we don't know the true total yet. Probe it with
  // a minimal call, clamp to the last valid page, and re-fetch that page's
  // slice server-side rather than rendering an empty grid. `page === 1`
  // with zero rows is the legitimate "no organizations exist" case, not an
  // out-of-range page -- skip the clamp there.
  if (orgList.length === 0 && page > 1) {
    const { data: countProbe, error: countProbeError } = await supabase.rpc("list_organizations", {
      p_limit: 1,
      p_offset: 0,
    });
    if (countProbeError) throw new Error(countProbeError.message);
    totalCount = (countProbe as OrganizationRow[] | null)?.[0]?.total_count ?? 0;
    page = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const { data: clampedFetch, error: clampedFetchError } = await supabase.rpc("list_organizations", {
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });
    if (clampedFetchError) throw new Error(clampedFetchError.message);
    orgList = (clampedFetch as OrganizationRow[] | null) || [];
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Administración de plataforma</h1>
        <form action={signOut}>
          <button className="text-sm underline text-ink-soft">Cerrar sesión</button>
        </form>
      </div>

      <div className="flex gap-4 mb-8 text-sm">
        <span className="underline text-ink">Empresas</span>
        <span className="text-ink-soft" title="Todavía no disponible">
          Cuestionarios
        </span>
        <span className="text-ink-soft" title="Todavía no disponible">
          Competencias
        </span>
        <Link href="/admin/gestion" className="text-ink-soft hover:text-ink hover:underline">
          Gestión Brújula
        </Link>
      </div>

      {inviteUrl && (
        <div className="mb-6 rounded-brujula-md bg-indigo-wash text-ink text-sm p-3">
          <p className="mb-2">
            Empresa <strong>{createdOrg}</strong> creada. Comparte este link con{" "}
            <strong>{createdEmail}</strong> para que complete su alta como
            administrador (todavía no enviamos emails automáticamente):
          </p>
          <input
            readOnly
            value={inviteUrl}
            className="w-full border border-line rounded-brujula-sm px-2 py-1 text-xs bg-paper-deep text-ink"
          />
        </div>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <form
        action={createOrganizationAsAdmin}
        className="flex flex-col gap-3 bg-paper-deep rounded-brujula-lg shadow-card p-6 mb-8"
      >
        <p className="text-sm font-medium text-ink">Crear empresa</p>
        <input
          name="orgName"
          type="text"
          required
          placeholder="Nombre de la empresa"
          className="border border-line rounded-brujula-sm px-3 py-2 text-sm bg-paper-deep text-ink"
        />
        <input
          name="adminFullName"
          type="text"
          placeholder="Nombre del primer administrador (opcional)"
          className="border border-line rounded-brujula-sm px-3 py-2 text-sm bg-paper-deep text-ink"
        />
        <input
          name="adminEmail"
          type="email"
          required
          placeholder="Email del primer administrador"
          className="border border-line rounded-brujula-sm px-3 py-2 text-sm bg-paper-deep text-ink"
        />
        <ButtonPrimary type="submit" className="self-start">
          Crear
        </ButtonPrimary>
      </form>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-medium text-ink-soft">Empresas</h2>
          {totalCount > 0 && (
            <AggregateBadge className="px-3 py-1">
              Vista agregada — {totalCount} {totalCount === 1 ? "empresa" : "empresas"}
            </AggregateBadge>
          )}
        </div>
        {orgList.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">Todavía no hay empresas creadas.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orgList.map((org) => (
              <Card key={org.id} className="flex flex-col gap-2 overflow-hidden">
                <Link
                  href={`/admin/empresas/${org.id}`}
                  className="font-medium text-ink hover:underline truncate"
                >
                  {org.name}
                </Link>
                <span className="text-xs text-ink-soft break-words">
                  {org.supervisor_email
                    ? `${org.supervisor_email} (${org.supervisor_status === "active" ? "activo" : "invitado"})`
                    : "sin administrador"}
                </span>
              </Card>
            ))}
          </div>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => {
            const params = new URLSearchParams({ page: String(p) });
            // Preserve the one-time post-creation invite-link banner across
            // pagination -- otherwise navigating Prev/Next right after
            // creating an org would silently drop it.
            if (created) params.set("created", created);
            if (createdEmail) params.set("createdEmail", createdEmail);
            if (createdOrg) params.set("createdOrg", createdOrg);
            return `/admin?${params.toString()}`;
          }}
          className="mt-6"
        />
      </section>
    </main>
  );
}
