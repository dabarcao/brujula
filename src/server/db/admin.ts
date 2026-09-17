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
