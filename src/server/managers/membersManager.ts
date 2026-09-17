// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): manager
// layer owning the organization-members domain (spec.md sección 4). Calls
// only `@/server/db/members` -- never imports @supabase/supabase-js or
// @supabase/ssr directly, and never calls redirect()/revalidatePath() (those
// stay one layer up, in the Server Action -- Story 3.4) or reads
// cookies/headers itself. RPC errors propagate as plain Errors carrying the
// RPC's own message text unchanged.
//
// Read-only reference this orchestration mirrors: src/app/actions/members.ts,
// src/app/admin/empresas/[id]/page.tsx, src/app/dashboard/page.tsx
// (unmodified by this story).

import "server-only";
import {
  listOrganizationMembers,
  inviteMember,
  createDepartment,
  acceptMemberInvite,
  claimPendingEmailInvitations,
  getOrganizationCompetencySummary as dbGetOrganizationCompetencySummary,
  getCurrentMember as dbGetCurrentMember,
  listMyOrganizationMembers as dbListMyOrganizationMembers,
  listDepartments as dbListDepartments,
  countActiveOrganizationMembers as dbCountActiveOrganizationMembers,
  listCompetencyFrameworks as dbListCompetencyFrameworks,
  listCompetencyPrinciples as dbListCompetencyPrinciples,
  listCompetencyRoles as dbListCompetencyRoles,
  createIndividualAccount as dbCreateIndividualAccount,
  type OrganizationMember,
  type OrganizationCompetencySummaryRow,
  type CurrentMember,
  type MyOrganizationMemberRow,
  type Department,
  type CompetencyFrameworkRow,
  type CompetencyPrincipleRow,
  type CompetencyRoleRow,
  type CreatedIndividualAccount,
} from "@/server/db/members";

export type {
  OrganizationCompetencySummaryRow,
  CurrentMember,
  MyOrganizationMemberRow,
  Department,
  CompetencyFrameworkRow,
  CompetencyPrincipleRow,
  CompetencyRoleRow,
  CreatedIndividualAccount,
};

export async function listMembers(orgId: string): Promise<OrganizationMember[]> {
  return listOrganizationMembers(orgId);
}

export async function inviteNewMember(
  email: string,
  fullName: string,
  departmentId: string,
  isGuest: boolean = false
): Promise<{ inviteToken: string }> {
  const inviteToken = await inviteMember(email, fullName, departmentId, isGuest);
  return { inviteToken };
}

export async function createNewDepartment(name: string): Promise<{ departmentId: string }> {
  const departmentId = await createDepartment(name);
  return { departmentId };
}

export async function acceptInvite(token: string): Promise<{ organizationId: string }> {
  const organizationId = await acceptMemberInvite(token);
  return { organizationId };
}

export async function claimPendingInvitations(): Promise<void> {
  await claimPendingEmailInvitations();
}

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition -- informe-empresa/page.tsx's own organization-wide
// competency summary read, composed here rather than through a new
// dedicated `reportsManager` (epics.md's own AC).
export async function getOrganizationCompetencySummary(): Promise<OrganizationCompetencySummaryRow[]> {
  return dbGetOrganizationCompetencySummary();
}

/**
 * Story 6.3: resolves the logged-in caller's own member row, or `null` if
 * not logged in / no member row yet. See db/members.ts's own
 * getCurrentMember() for the full rationale.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  return dbGetCurrentMember();
}

/**
 * dashboard/members/page.tsx's own full org-roster read (own organization,
 * Supervisor-managed) -- differently shaped/scoped than `listMembers`
 * above. See db/members.ts's own `listMyOrganizationMembers` for the full
 * rationale.
 */
export async function listMyOrganizationMembers(): Promise<MyOrganizationMemberRow[]> {
  return dbListMyOrganizationMembers();
}

/** dashboard/members/page.tsx's department picker + department-name lookup. */
export async function listDepartments(): Promise<Department[]> {
  return dbListDepartments();
}

/** informe-empresa/page.tsx's "Vista agregada — N personas" badge count. */
export async function countActiveOrganizationMembers(organizationId: string): Promise<number> {
  return dbCountActiveOrganizationMembers(organizationId);
}

/**
 * Shared `competency_frameworks` catalog read -- reused by both
 * mi-mapa/page.tsx and informe-empresa/page.tsx. See db/members.ts's own
 * `listCompetencyFrameworks` for why this landed here.
 */
export async function listCompetencyFrameworks(): Promise<CompetencyFrameworkRow[]> {
  return dbListCompetencyFrameworks();
}

/**
 * Story 7.3 (Biblioteca page): the platform-wide `competency_principles`
 * catalog (Plenitud + the Teal-organizations framing row). See
 * db/members.ts's own `listCompetencyPrinciples` for why this is a
 * separate function from `listCompetencyFrameworks` above.
 */
export async function listCompetencyPrinciples(): Promise<CompetencyPrincipleRow[]> {
  return dbListCompetencyPrinciples();
}

/**
 * Story 7.3 (Biblioteca page): the platform-wide `competency_roles`
 * catalog (Visión/Arquitecto/Catalizador/Coach), each with its own
 * descriptive paragraph. See db/members.ts's own `listCompetencyRoles`.
 */
export async function listCompetencyRoles(): Promise<CompetencyRoleRow[]> {
  return dbListCompetencyRoles();
}

/**
 * dashboard/page.tsx's own post-signup bootstrap for the individual-account
 * flow. See db/members.ts's own `createIndividualAccount` for the full
 * rationale.
 */
export async function createIndividualAccount(
  fullName: string,
  email: string
): Promise<CreatedIndividualAccount> {
  return dbCreateIndividualAccount(fullName, email);
}
