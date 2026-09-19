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
  getMemberForAdminEdit,
  updateMemberProfile,
  updateMemberAuthEmail,
  findMemberByEmail,
  type OrganizationSummary,
  type MemberLocation,
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

/**
 * Edita nombre y email de un empleado desde el panel de Admin general.
 * Si el empleado ya tiene cuenta de Supabase Auth (authUserId) y el email
 * cambia de verdad, actualiza primero auth.users vía la Admin API -- solo
 * si eso sale bien se toca `members`, para no dejar las dos copias
 * desincronizadas. Un empleado todavía "invited" no tiene auth_user_id
 * todavía, así que ese paso se salta y solo se actualiza `members`.
 */
export async function editMemberProfile(
  memberId: string,
  fullName: string,
  email: string
): Promise<void> {
  const member = await getMemberForAdminEdit(memberId);
  const trimmedEmail = email.trim().toLowerCase();

  if (member.authUserId && trimmedEmail !== member.email.toLowerCase()) {
    await updateMemberAuthEmail(member.authUserId, trimmedEmail);
  }

  await updateMemberProfile(memberId, fullName.trim(), trimmedEmail);
}

/** Resuelve un email a la organización donde vive ese empleado, o null si no existe. */
export async function locateMemberByEmail(email: string): Promise<MemberLocation | null> {
  return findMemberByEmail(email);
}
