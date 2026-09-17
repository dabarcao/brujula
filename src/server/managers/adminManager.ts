// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): manager
// layer owning the platform-admin domain (spec.md sección 2). Calls only
// `@/server/db/admin` -- never imports @supabase/supabase-js or
// @supabase/ssr directly, and never calls redirect()/revalidatePath() (those
// stay one layer up, in the Server Action -- Story 3.4) or reads
// cookies/headers itself. RPC errors propagate as plain Errors carrying the
// RPC's own message text unchanged.
//
// Read-only reference this orchestration mirrors: src/app/actions/admin.ts,
// src/app/admin/page.tsx, src/app/admin/empresas/[id]/page.tsx (unmodified
// by this story).

import "server-only";
import {
  isPlatformAdmin,
  listOrganizations,
  createOrganizationAsAdmin,
  updateOrganizationName,
  type OrganizationSummary,
} from "@/server/db/admin";

export async function checkIsPlatformAdmin(): Promise<boolean> {
  return isPlatformAdmin();
}

export async function listAllOrganizations(): Promise<OrganizationSummary[]> {
  return listOrganizations();
}

export async function createOrganization(
  orgName: string,
  adminEmail: string,
  adminFullName: string
): Promise<{ inviteToken: string }> {
  const inviteToken = await createOrganizationAsAdmin(orgName, adminEmail, adminFullName);
  return { inviteToken };
}

export async function renameOrganization(orgId: string, newName: string): Promise<void> {
  await updateOrganizationName(orgId, newName);
}
