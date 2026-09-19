// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): db-access
// layer for the platform-admin domain (spec.md sección 2). Thin, typed
// wrappers around the admin RPCs (supabase/migrations/0016, 0017), mirroring
// Story 1.2's src/server/db/reportGroups.ts shape exactly -- this file is
// deliberately the only new code for this domain that constructs a Supabase
// client; every exported function is plain-TypeScript typed (no
// PostgrestError, no raw SupabaseClient, in any signature).
//
// Read-only reference this was wrapped from: src/app/actions/admin.ts,
// src/app/admin/page.tsx, src/app/admin/empresas/[id]/page.tsx (all
// unmodified by this story -- they keep calling supabase.rpc directly until
// Story 3.4 refactors them to delegate here).

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/server/infra/supabaseAdmin";

export type OrganizationSummary = {
  id: string;
  name: string;
  createdAt: string;
  supervisorEmail: string | null;
  supervisorStatus: string | null;
};

// Raw jsonb/row shapes as the RPCs actually return them (snake_case) --
// kept private to this file; callers only ever see the camelCase types above.
type RawOrganizationSummary = {
  id: string;
  name: string;
  created_at: string;
  supervisor_email: string | null;
  supervisor_status: string | null;
};

/** Wraps `is_platform_admin`. No params, no exceptions (src/app/admin/page.tsx:37). */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Wraps `list_organizations`. Internally gated by `is_platform_admin()` --
 * returns an empty array (not an error) for a non-admin caller.
 */
export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_organizations");
  if (error) throw new Error(error.message);

  const rows = (data as RawOrganizationSummary[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    supervisorEmail: row.supervisor_email,
    supervisorStatus: row.supervisor_status,
  }));
}

/**
 * Wraps `create_organization_as_admin`. Throws the RPC's own message on
 * failure (e.g. non-platform-admin caller, missing org name/admin email).
 * Returns the first Supervisor's invite token.
 */
export async function createOrganizationAsAdmin(
  orgName: string,
  adminEmail: string,
  adminFullName: string
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization_as_admin", {
    p_org_name: orgName,
    p_admin_email: adminEmail,
    p_admin_full_name: adminFullName,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Wraps `update_organization_name`. Throws the RPC's own message on failure. */
export async function updateOrganizationName(orgId: string, newName: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organization_name", {
    p_org_id: orgId,
    p_new_name: newName,
  });
  if (error) throw new Error(error.message);
}

export type MemberForAdminEdit = {
  id: string;
  organizationId: string;
  authUserId: string | null;
  email: string;
  fullName: string | null;
};

type RawMemberForAdminEdit = {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
};

/**
 * Wraps `admin_get_member` (supabase/migrations/0103). Throws the RPC's own
 * message on failure (e.g. non-admin caller). Throws locally if the member
 * doesn't exist -- the RPC returns zero rows rather than raising for that
 * case.
 */
export async function getMemberForAdminEdit(memberId: string): Promise<MemberForAdminEdit> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_member", { p_member_id: memberId });
  if (error) throw new Error(error.message);

  const row = (data as RawMemberForAdminEdit[] | null)?.[0];
  if (!row) throw new Error("Empleado no encontrado.");

  return {
    id: row.id,
    organizationId: row.organization_id,
    authUserId: row.auth_user_id,
    email: row.email,
    fullName: row.full_name,
  };
}

/** Wraps `admin_update_member` (supabase/migrations/0103). Throws the RPC's own message on failure. */
export async function updateMemberProfile(
  memberId: string,
  fullName: string,
  email: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_member", {
    p_member_id: memberId,
    p_full_name: fullName,
    p_email: email,
  });
  if (error) throw new Error(error.message);
}

/**
 * Cambia el email real de la identidad de Supabase Auth vía la Admin API
 * (service_role, se salta RLS -- es la única forma de tocar auth.users
 * desde código de la app). Debe llamarse ANTES de updateMemberProfile, para
 * que `members` solo cambie una vez la identidad de login ya se actualizó.
 */
export type MemberLocation = {
  memberId: string;
  organizationId: string;
};

type RawMemberLocation = {
  member_id: string;
  organization_id: string;
};

/**
 * Wraps `admin_find_member_by_email` (supabase/migrations/0104). Resolves
 * any member's email (company employee or individual-account owner --
 * organizations of kind='individual' never show up in listOrganizations,
 * 0102) to the organization it lives in, so /admin can jump straight to
 * /admin/empresas/{organizationId}. Returns null if no member has that
 * email -- not an error, callers decide how to surface "not found". Throws
 * the RPC's own message only for a non-admin caller.
 */
export async function findMemberByEmail(email: string): Promise<MemberLocation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_find_member_by_email", { p_email: email });
  if (error) throw new Error(error.message);

  const row = (data as RawMemberLocation[] | null)?.[0];
  if (!row) return null;

  return { memberId: row.member_id, organizationId: row.organization_id };
}

export async function updateMemberAuthEmail(authUserId: string, newEmail: string): Promise<void> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    email: newEmail,
  });
  if (error) throw new Error(error.message);
}
