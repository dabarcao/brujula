// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): db-access
// layer for the organization-members domain (spec.md sección 4). Thin,
// typed wrappers around the members/department RPCs (supabase/migrations/
// 0017, 0020, 0045, 0046), mirroring Story 1.2's
// src/server/db/reportGroups.ts shape exactly -- this file is deliberately
// the only new code for this domain that constructs a Supabase client;
// every exported function is plain-TypeScript typed (no PostgrestError, no
// raw SupabaseClient, in any signature).
//
// Read-only reference this was wrapped from: src/app/actions/members.ts,
// src/app/admin/empresas/[id]/page.tsx, src/app/dashboard/page.tsx (all
// unmodified by this story -- they keep calling supabase.rpc directly until
// Story 3.4 refactors them to delegate here).

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/db/auth";

export type OrganizationMember = {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  isSupervisor: boolean;
  departmentName: string | null;
  createdAt: string;
};

// Raw jsonb/row shape as the RPC actually returns it (snake_case) -- kept
// private to this file; callers only ever see the camelCase type above.
type RawOrganizationMember = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  is_supervisor: boolean;
  department_name: string | null;
  created_at: string;
};

/** Wraps `list_organization_members`. Throws the RPC's own message on failure. */
export async function listOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_organization_members", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);

  const rows = (data as RawOrganizationMember[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    isSupervisor: row.is_supervisor,
    departmentName: row.department_name,
    createdAt: row.created_at,
  }));
}

/**
 * Wraps `invite_member`. Throws the RPC's own message on failure (e.g.
 * non-admin caller, missing/invalid department, duplicate email). Returns
 * the new member's invite token.
 *
 * Story 7.4 (ports the Invitado portion of upstream commit 62e2ed8, schema
 * from supabase/migrations/0076_guest_member_type.sql): `isGuest` gained a
 * matching `p_is_guest` RPC param, default `false` so every existing call
 * site (and the old 3-arg RPC signature callers relied on) keeps working
 * unchanged. An Invitado can log in and respond to feedback when invited to
 * (evaluator) but can never request feedback or be a company 360 cycle's
 * subject -- enforced by the RPCs themselves (`create_ad_hoc_feedback_
 * request`, `create_feedback_cycle`), not re-checked here.
 */
export async function inviteMember(
  email: string,
  fullName: string,
  departmentId: string,
  isGuest: boolean = false
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_member", {
    p_email: email,
    p_full_name: fullName,
    p_department_id: departmentId,
    p_is_guest: isGuest,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Wraps `create_department`. Throws the RPC's own message on failure. Returns the new department id. */
export async function createDepartment(name: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_department", { p_name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Wraps `accept_member_invite`. Throws the RPC's own message on failure
 * (e.g. no session, invalid/used token, email mismatch). Returns the
 * member's organization id.
 */
export async function acceptMemberInvite(token: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_member_invite", { p_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Wraps `claim_pending_email_invitations`. No params, silently no-ops if
 * the caller has no `members` row; never raises.
 */
export async function claimPendingEmailInvitations(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_pending_email_invitations");
  if (error) throw new Error(error.message);
}

export type CurrentMember = {
  id: string;
  isSupervisor: boolean;
  isGuest: boolean;
  organizationId: string;
  status: string;
  organization: { name: string; kind: string } | null;
};

/**
 * Story 6.3 (session-resolution completion, _bmad-output/
 * implementation-artifacts/spec-6-3-*.md): resolves the logged-in caller's
 * own `members` row -- generalizes the shape every page-level self-lookup
 * across this app already duplicated inline (`.from("members").select(...)
 * .eq("auth_user_id", user.id).maybeSingle()`, with a differing column list
 * per call site). Returns the superset every known caller needs; a caller
 * that only needs `id`/`isSupervisor` just ignores the rest -- same
 * "one list, multiple consumers" precedent as `cyclesManager.
 * getMyCycleRequests()` already being reused by two different sections of
 * dashboard/page.tsx.
 *
 * No RPC wraps this (none exists for "my own member row" -- confirmed no
 * `get_my_member`-shaped function anywhere in supabase/migrations/), so
 * this is a direct, RLS-scoped table read, same as the two narrower
 * private `getCallerMemberId()` helpers in db/cycles.ts/db/feedback.ts
 * (id-only, kept as-is, not replaced by this -- they predate this function
 * and are already covered by their own domains' tests). Returns `null` for
 * "not logged in" or "no member row yet" alike -- callers already branch
 * on both cases identically (redirect to /login or treat as a first-visit
 * bootstrap state), so a single `null` return matches every existing call
 * site's own logic without forcing a distinction they don't make today.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, is_supervisor, is_guest, organization_id, status, organizations(name, kind)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const org = data.organizations as unknown as { name: string; kind: string } | null;
  return {
    id: data.id as string,
    isSupervisor: data.is_supervisor as boolean,
    isGuest: data.is_guest as boolean,
    organizationId: data.organization_id as string,
    status: data.status as string,
    organization: org,
  };
}

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition for informe-empresa/page.tsx (spec.md's own AC that it
// should compose the existing managers instead of a new dedicated one).
// `get_organization_competency_summary` is Supervisor-only, single-org-
// scoped (0054_expose_role_in_competency_reports.sql:83+). Placed here
// rather than `adminManager` (platform-admin/cross-org only, per this
// story's own frozen Intent) -- `membersManager` is already org-scoped and
// already aggregates across an org's members (`listMembers`).
export type OrganizationCompetencySummaryRow = {
  competencyCode: string;
  competencyName: string;
  principleCode: string | null;
  principleName: string | null;
  roleCode: string | null;
  roleName: string | null;
  avgValue: number;
  responseCount: number;
};

type RawOrganizationCompetencySummaryRow = {
  competency_code: string;
  competency_name: string;
  principle_code: string | null;
  principle_name: string | null;
  role_code: string | null;
  role_name: string | null;
  avg_value: number;
  response_count: number;
};

/**
 * Wraps `get_organization_competency_summary`. No params, Supervisor-only
 * and caller's-own-organization-scoped internally by the RPC -- throws the
 * RPC's own message unmodified for a non-Supervisor caller ("Solo el
 * administrador de la empresa puede ver este informe."), same as every
 * other manager function in this file. No permission re-check added here
 * (the RPC already enforces it).
 */
export async function getOrganizationCompetencySummary(): Promise<OrganizationCompetencySummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_organization_competency_summary");
  if (error) throw new Error(error.message);

  const rows = (data as RawOrganizationCompetencySummaryRow[] | null) || [];
  return rows.map((row) => ({
    competencyCode: row.competency_code,
    competencyName: row.competency_name,
    principleCode: row.principle_code,
    principleName: row.principle_name,
    roleCode: row.role_code,
    roleName: row.role_name,
    avgValue: row.avg_value,
    responseCount: row.response_count,
  }));
}

// Members/self/reports domain migration (dashboard/members/page.tsx): a
// full org-member list read with a DIFFERENT shape than
// `listOrganizationMembers` above -- that one wraps `list_organization_members`,
// an RPC that is `is_platform_admin()`-gated internally (supabase/migrations/
// 0020_remove_manager_role.sql:81-108: `where m.organization_id = p_org_id
// and is_platform_admin()`), used by the platform-admin org-detail page
// (out of this domain's scope). dashboard/members/page.tsx is the
// *organization's own Supervisor* managing their own org's roster -- it
// never had a p_org_id to pass, and instead reads `members` directly,
// relying on the "members see colleagues in same organization" RLS policy
// (0001_initial_schema.sql:205-207) to scope it. It also selects two
// columns `listOrganizationMembers`'s RPC never returns at all
// (`department_id`, `invite_token` -- needed to resolve each member's
// department name client-side and to link back to the "ver link" invite
// URL), so this is a new, differently-scoped, differently-shaped function,
// not an extension of the existing one.
export type MyOrganizationMemberRow = {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  isSupervisor: boolean;
  isGuest: boolean;
  departmentId: string;
  inviteToken: string;
  createdAt: string;
};

type RawMyOrganizationMemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  is_supervisor: boolean;
  is_guest: boolean;
  department_id: string;
  invite_token: string;
  created_at: string;
};

/**
 * Direct `members` table read, RLS-scoped to the caller's own organization
 * (no RPC exists for this shape). Order matches the page's existing query
 * (`created_at` ascending). Throws on failure -- callers wrap in try/catch
 * if they want the same "just show nothing" fallback the old unchecked
 * `.data`-only read had.
 */
export async function listMyOrganizationMembers(): Promise<MyOrganizationMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, email, full_name, status, is_supervisor, is_guest, department_id, invite_token, created_at"
    )
    .order("created_at");
  if (error) throw new Error(error.message);

  const rows = (data as RawMyOrganizationMemberRow[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    isSupervisor: row.is_supervisor,
    isGuest: row.is_guest,
    departmentId: row.department_id,
    inviteToken: row.invite_token,
    createdAt: row.created_at,
  }));
}

export type Department = {
  id: string;
  name: string;
};

/**
 * Direct `departments` table read, RLS-scoped to the caller's own
 * organization (`departments scoped to organization`,
 * 0006_departments_and_360_template.sql:51-53). Used by
 * dashboard/members/page.tsx to resolve each member's department name and
 * populate the invite form's department picker.
 */
export async function listDepartments(): Promise<Department[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("departments").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data as Department[] | null) || [];
}

/**
 * Direct, `head: true` count-only `members` read, explicitly scoped to
 * `organizationId` + `status = 'active'` -- mirrors
 * informe-empresa/page.tsx's own existing query exactly (including the
 * explicit organization_id filter, redundant with RLS but kept to match
 * prior behavior precisely). Used only for the "Vista agregada — N
 * personas" badge; see that page's own comment for why this is a
 * best-effort approximation (counts every active member, not specifically
 * who cleared the reveal threshold).
 */
export async function countActiveOrganizationMembers(organizationId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Members/self/reports domain migration: `competency_frameworks` is a
// platform-wide, publicly-readable catalog (RLS: "competency_frameworks
// readable by anyone authenticated", 0001_initial_schema.sql:195-197) --
// not org-scoped, not member-scoped. Both mi-mapa/page.tsx and
// informe-empresa/page.tsx read the exact same `.select(...)` column list
// (verified byte-for-byte identical) to feed the same shared
// `buildCompetencyAxes` (src/lib/competencyAxes.ts) helper, so this is one
// shared function, not two. Landed in `membersManager` rather than a new
// dedicated manager/db file: same precedent as
// `getOrganizationCompetencySummary` just above (Story 3.26's own
// composition choice for this domain's read-only reports), and
// mi-mapa/page.tsx already reaches across domains for
// `feedbackManager.getMyCompetencyMap()` -- reaching into `membersManager`
// for this one shared catalog read is the same kind of cross-domain reuse,
// not a new architectural seam.
export type CompetencyFrameworkRow = {
  code: string;
  name: string;
  // Story 7.3 (Biblioteca + AI-interpretation thresholds, migration
  // 0079_competency_thresholds.sql): `description` already existed on this
  // table since 0001_initial_schema.sql but was never selected by this
  // function -- the Biblioteca page (and aiInterpretationManager's prompt)
  // both need it now, so it's added here rather than in a second read of
  // the same table. thresholdHigh/thresholdLow are new columns from that
  // same migration -- null for any competency without a recorded
  // threshold yet, never defaulted here (the Biblioteca/prompt decide how
  // to render/skip a missing one, not this db-layer read).
  description: string | null;
  thresholdHigh: string | null;
  thresholdLow: string | null;
  principleId: string | null;
  roleId: string | null;
  principle: { code: string; name: string; position: number } | null;
  role: { code: string; name: string; position: number } | null;
};

type RawCompetencyFrameworkRow = {
  code: string;
  name: string;
  description: string | null;
  threshold_high: string | null;
  threshold_low: string | null;
  principle_id: string | null;
  role_id: string | null;
  competency_principles: { code: string; name: string; position: number } | null;
  competency_roles: { code: string; name: string; position: number } | null;
};

/**
 * Wraps the shared `competency_frameworks` read both mi-mapa/page.tsx and
 * informe-empresa/page.tsx make, now extended (Story 7.3) with
 * description/threshold_high/threshold_low for the new Biblioteca page and
 * aiInterpretationManager's prompt -- both existing callers just ignore the
 * 3 extra fields, same `order("name")`. Throws on failure -- callers wrap
 * in try/catch for the same "render with an empty framework list" fallback
 * the old unchecked `.data`-only read had.
 */
export async function listCompetencyFrameworks(): Promise<CompetencyFrameworkRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competency_frameworks")
    .select(
      "code, name, description, threshold_high, threshold_low, principle_id, role_id, competency_principles(code, name, position), competency_roles(code, name, position)"
    )
    .order("name");
  if (error) throw new Error(error.message);

  const rows = (data as unknown as RawCompetencyFrameworkRow[] | null) || [];
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    description: row.description,
    thresholdHigh: row.threshold_high,
    thresholdLow: row.threshold_low,
    principleId: row.principle_id,
    roleId: row.role_id,
    principle: row.competency_principles,
    role: row.competency_roles,
  }));
}

export type CompetencyPrincipleRow = {
  code: string;
  name: string;
  description: string | null;
  position: number;
};

/**
 * Story 7.3 (Biblioteca): wraps the platform-wide `competency_principles`
 * catalog -- same table `listCompetencyFrameworks` above already embeds a
 * narrow slice of (code/name/position only) for each framework's parent
 * principle, but the Biblioteca page also needs the two "standalone" rows
 * that never back any framework: 'wholeness' (Plenitud) and
 * 'organizacion_teal' (the Teal-organizations framing text, migration
 * 0069_biblioteca_texts_and_teal_framework.sql) -- both need their own
 * `description`, not selectable through that embed. New function rather
 * than widening the embed: the embed is keyed off `principle_id` FKs on
 * `competency_frameworks`, so a principle with no framework pointing at it
 * (like 'organizacion_teal') would never appear there regardless.
 */
export async function listCompetencyPrinciples(): Promise<CompetencyPrincipleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competency_principles")
    .select("code, name, description, position")
    .order("position");
  if (error) throw new Error(error.message);

  const rows = (data as CompetencyPrincipleRow[] | null) || [];
  return rows;
}

export type CompetencyRoleRow = {
  code: string;
  name: string;
  description: string | null;
  position: number;
};

/**
 * Story 7.3 (Biblioteca): wraps the platform-wide `competency_roles`
 * catalog (Visión/Arquitecto/Catalizador/Coach) -- same reasoning as
 * `listCompetencyPrinciples` above: the embed inside
 * `listCompetencyFrameworks` only carries code/name/position per
 * framework row, never `description`, and the Biblioteca needs each
 * role's own descriptive paragraph exactly once, not repeated per
 * framework.
 */
export async function listCompetencyRoles(): Promise<CompetencyRoleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competency_roles")
    .select("code, name, description, position")
    .order("position");
  if (error) throw new Error(error.message);

  const rows = (data as CompetencyRoleRow[] | null) || [];
  return rows;
}

export type CreatedIndividualAccount = {
  memberId: string;
  organizationId: string;
  organizationName: string;
  organizationKind: string;
  isSupervisor: boolean;
};

type RawCreatedIndividualAccount = {
  member_id: string;
  organization_id: string;
  organization_name: string;
  organization_kind: string;
  is_supervisor: boolean;
};

/**
 * Wraps `create_individual_account` (dashboard/page.tsx's own bootstrap
 * flow for a first-time login after individual-account signup, see
 * 0041_individual_account_returns_member.sql). Deliberately returns
 * everything the caller needs directly instead of requiring a re-read of
 * `members` afterwards -- that migration's own comment documents a real
 * race where an immediate re-read in the same request sometimes missed the
 * just-inserted row. Throws the RPC's own message on failure (e.g. no
 * session, already has an account). The created member's `status` is
 * always `'active'` by construction (see that migration's insert) -- not
 * part of the RPC's return columns, so not modeled here; callers that need
 * a full `CurrentMember`-shaped object fill it in themselves.
 */
export async function createIndividualAccount(
  fullName: string,
  email: string
): Promise<CreatedIndividualAccount> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_individual_account", { p_full_name: fullName, p_email: email })
    .single();
  if (error) throw new Error(error.message);

  const row = data as unknown as RawCreatedIndividualAccount;
  return {
    memberId: row.member_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationKind: row.organization_kind,
    isSupervisor: row.is_supervisor,
  };
}
