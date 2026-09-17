// Story 1.2 (_bmad-output/implementation-artifacts/
// spec-1-2-db-access-manager-scaffolding-report-groups.md): db-access layer
// for report groups (spec.md sección 17). Thin, typed wrappers around the
// report-group RPCs (supabase/migrations/0064_report_groups.sql, 0065, 0066)
// -- this file is deliberately the only new code for this domain that
// constructs a Supabase client; every exported function is plain-TypeScript
// typed (no PostgrestError, no raw SupabaseClient, in any signature).
//
// Read-only reference this was wrapped from: src/app/actions/reportGroups.ts
// (unmodified by this story -- it keeps calling supabase.rpc directly until
// Stories 1.5/1.6 refactor it to delegate here).

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReportGroupStatus = "open" | "closed";
export type ReportGroupMemberStatus = "pending" | "accepted" | "rejected";

export type ReportGroupMember = {
  memberId: string;
  fullName: string | null;
  email: string;
  status: ReportGroupMemberStatus;
};

export type ReportGroupDetail = {
  id: string;
  name: string;
  status: ReportGroupStatus;
  isCreator: boolean;
  myStatus: ReportGroupMemberStatus | null;
  // Sensitive content -- get_report_group itself only populates this for
  // the creator or an accepted member; a pending/rejected invitee always
  // sees null here even though the row is otherwise visible (see the RPC's
  // own comment, supabase/migrations/0064_report_groups.sql).
  aiInterpretation: string | null;
  members: ReportGroupMember[];
  // -- Computed fields below: business logic that used to be recomputed by
  // hand in src/app/dashboard/groups/[id]/page.tsx from the raw fields
  // above. Moved here so the page only ever renders, matching the
  // acceptedCount precedent getMyReportGroups (below) already established
  // for the sibling list view.
  /** `members` filtered to `status === "accepted"`, counted once here. */
  acceptedCount: number;
  /** `members` filtered to `status === "pending"`. */
  pendingCount: number;
  /** `members` filtered to `status === "rejected"`. */
  rejectedCount: number;
  /**
   * Eligibility to attempt closing the group at all: an open group, and the
   * caller already accepted their own invitation (close_report_group,
   * supabase/migrations/0064_report_groups.sql, enforces the same "must be
   * an accepted member" rule server-side; this mirrors it for rendering).
   */
  canClose: boolean;
  /**
   * Every current member has responded 'accepted' -- none left pending or
   * rejected. 2026-09-17: this, not a minimum count, is now the real
   * closing gate (close_report_group, 0099_report_groups_membership_
   * management_and_email.sql) -- a lingering pending/rejected member means
   * "not yet", never "close without them".
   */
  allAccepted: boolean;
  /** Whether `acceptedCount` has reached MIN_ACCEPTED_TO_CLOSE (see below) -- the anonymity floor, independent of `allAccepted`. */
  meetsMinimumSize: boolean;
  /**
   * Whether the close button should actually be enabled: `canClose` is
   * eligibility to attempt at all (so the page still shows the section and
   * the member list), this is whether the attempt would actually succeed
   * server-side right now.
   */
  readyToClose: boolean;
  /**
   * Who may see the closed-group aggregate report: the creator, or anyone
   * who accepted their invitation. A pending/rejected invitee never can,
   * even after the group closes -- get_report_group_competency_summary
   * would reject them anyway, so the page skips calling it entirely.
   */
  canSeeReport: boolean;
  /**
   * Whether the caller may invite more people or remove a member right
   * now: an open group, and either the creator or an already-accepted
   * member (add_report_group_members/remove_report_group_member,
   * 0099_report_groups_membership_management_and_email.sql, enforce the
   * same rule server-side -- this mirrors it for rendering). The "or the
   * creator" half is redundant today -- create_report_group now inserts
   * the creator as an accepted member of their own group from the start
   * (see that migration's own comment on why: the anonymity-floor count
   * should include the creator, not just invitees) -- kept explicit
   * anyway, matching the RPCs' own defensive `or` rather than assuming
   * that will always hold.
   */
  canManageMembers: boolean;
};

// close_report_group (supabase/migrations/0064_report_groups.sql,
// redefined by 0099_report_groups_membership_management_and_email.sql)
// enforces the real minimum with `coalesce(platform_settings.
// min_invitees_per_request for the group's org, the global default, 5)` --
// i.e. it CAN be configured per-organization, same as the
// min_invitees_per_request precedent for cycles/feedback requests. That
// per-org value isn't available to this read-only RPC's response
// (get_report_group returns no organization_id or threshold field), and
// adding one is a schema/RPC change outside this layering fix's scope.
// This constant instead reproduces the exact value the page already
// hardcoded before this refactor (the platform-wide default, and the
// floor every org is constrained to via `min_invitees_floor check
// (min_invitees_per_request >= 5)`), so `meetsMinimumSize` matches prior
// page behavior bit-for-bit. The RPC itself remains the sole source of
// truth enforced at close time.
//
// 2026-09-17 (user-requested behavior change): closing used to only need
// this many ACCEPTED members, regardless of how many others were still
// pending/rejected. Now it needs ALL current members accepted (see
// `allAccepted` below) -- this constant stays as the separate anonymity
// floor on top of that, not instead of it.
const MIN_ACCEPTED_TO_CLOSE = 5;

export type ReportGroupCompetencySummaryRow = {
  competencyCode: string;
  competencyName: string;
  roleCode: string | null;
  roleName: string | null;
  peerAvgValue: number | null;
  selfAvgValue: number | null;
  memberCount: number;
};

// Raw jsonb/row shapes as the RPCs actually return them (snake_case) --
// kept private to this file; callers only ever see the camelCase types above.
type RawReportGroupDetail = {
  id: string;
  name: string;
  status: ReportGroupStatus;
  is_creator: boolean;
  my_status: ReportGroupMemberStatus | null;
  ai_interpretation: string | null;
  members: {
    member_id: string;
    full_name: string | null;
    email: string;
    status: ReportGroupMemberStatus;
  }[];
};

type RawReportGroupCompetencySummaryRow = {
  competency_code: string;
  competency_name: string;
  role_code: string | null;
  role_name: string | null;
  peer_avg_value: number | null;
  self_avg_value: number | null;
  member_count: number;
};

// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): read-model
// composition for dashboard/page.tsx (spec.md's own AC that it should
// compose the existing managers instead of a new dedicated one).
// `get_my_report_groups` (line 245) -- confirmed via repo-wide grep
// (Story 3.25's own characterization test) to have no existing wrapper
// despite the name similarity to this file's other functions. Goes here,
// not a new manager: already the domain that owns `getGroup`/
// `getGroupCompetencySummary` (this story's own frozen Intent).
export type ReportGroupSummaryRow = {
  id: string;
  name: string;
  status: ReportGroupStatus;
  createdByMemberId: string;
  isCreator: boolean;
  myStatus: ReportGroupMemberStatus | null;
  acceptedCount: number;
  totalCount: number;
};

type RawReportGroupSummaryRow = {
  id: string;
  name: string;
  status: ReportGroupStatus;
  created_by_member_id: string;
  is_creator: boolean;
  my_status: ReportGroupMemberStatus | null;
  accepted_count: number;
  total_count: number;
};

// 0099_report_groups_membership_management_and_email.sql: a member of a
// group just created or just (re-)invited -- create_report_group and
// add_report_group_members both return exactly this shape (one row per
// invitee actually touched), so the manager can build and send the
// invitation email without a second round trip. `inviterFullName`/
// `inviterEmail` repeat per row (the RPC's own caller, not the invitee) --
// same value on every row of one call, simplest shape for a `returns
// table` RPC.
export type NewReportGroupInvitee = {
  memberId: string;
  email: string;
  fullName: string | null;
  inviterFullName: string | null;
  inviterEmail: string;
};

type RawNewReportGroupInvitee = {
  member_id: string;
  email: string;
  full_name: string | null;
  inviter_full_name: string | null;
  inviter_email: string;
};

function mapNewInvitee(row: RawNewReportGroupInvitee): NewReportGroupInvitee {
  return {
    memberId: row.member_id,
    email: row.email,
    fullName: row.full_name,
    inviterFullName: row.inviter_full_name,
    inviterEmail: row.inviter_email,
  };
}

export type CreateReportGroupResult = {
  groupId: string;
  invitees: NewReportGroupInvitee[];
};

/** Wraps `create_report_group`. Throws the RPC's own message on failure (e.g. an ineligible invitee, or the caller has no closed 360 of their own). */
export async function createReportGroup(
  name: string,
  memberIds: string[]
): Promise<CreateReportGroupResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_report_group", {
    p_name: name,
    p_member_ids: memberIds,
  });
  if (error) throw new Error(error.message);

  const rows = (data as (RawNewReportGroupInvitee & { group_id: string })[] | null) || [];
  if (rows.length === 0) {
    // Unreachable in practice -- create_report_group always inserts at
    // least one member_id (p_member_ids is validated non-empty) before
    // returning -- but typed defensively rather than asserting rows[0].
    throw new Error("create_report_group no devolvió ningún invitado.");
  }

  return {
    groupId: rows[0].group_id,
    invitees: rows.map(mapNewInvitee),
  };
}

/** Wraps `add_report_group_members`. Throws the RPC's own message on failure (e.g. group already closed, or an ineligible invitee). Returns only the invitees actually added or re-invited -- someone already pending/accepted is silently skipped, never returned. */
export async function addReportGroupMembers(
  groupId: string,
  memberIds: string[]
): Promise<NewReportGroupInvitee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_report_group_members", {
    p_group_id: groupId,
    p_member_ids: memberIds,
  });
  if (error) throw new Error(error.message);

  const rows = (data as RawNewReportGroupInvitee[] | null) || [];
  return rows.map(mapNewInvitee);
}

/** Wraps `remove_report_group_member`. Throws the RPC's own message on failure (e.g. group already closed, or the caller isn't allowed to manage membership). */
export async function removeReportGroupMember(groupId: string, memberId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_report_group_member", {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error) throw new Error(error.message);
}

/** Wraps `respond_to_report_group`. Throws the RPC's own message on failure. */
export async function respondToReportGroup(groupId: string, accept: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_report_group", {
    p_group_id: groupId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

/** Wraps `close_report_group`. Throws the RPC's own message on failure (e.g. someone still pending/rejected, or below the minimum group size). */
export async function closeReportGroup(groupId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_report_group", { p_group_id: groupId });
  if (error) throw new Error(error.message);
}

/** Wraps `get_report_group`. Throws the RPC's own message on failure (e.g. no access, not found). */
export async function getReportGroup(groupId: string): Promise<ReportGroupDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_report_group", { p_group_id: groupId });
  if (error) throw new Error(error.message);

  const raw = data as RawReportGroupDetail;
  const acceptedCount = raw.members.filter((m) => m.status === "accepted").length;
  const pendingCount = raw.members.filter((m) => m.status === "pending").length;
  const rejectedCount = raw.members.filter((m) => m.status === "rejected").length;
  const allAccepted = raw.members.length > 0 && pendingCount === 0 && rejectedCount === 0;
  const meetsMinimumSize = acceptedCount >= MIN_ACCEPTED_TO_CLOSE;
  const canClose = raw.status === "open" && raw.my_status === "accepted";

  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    isCreator: raw.is_creator,
    myStatus: raw.my_status,
    aiInterpretation: raw.ai_interpretation,
    members: raw.members.map((m) => ({
      memberId: m.member_id,
      fullName: m.full_name,
      email: m.email,
      status: m.status,
    })),
    acceptedCount,
    pendingCount,
    rejectedCount,
    canClose,
    allAccepted,
    meetsMinimumSize,
    readyToClose: allAccepted && meetsMinimumSize,
    canSeeReport: raw.is_creator || raw.my_status === "accepted",
    canManageMembers: raw.status === "open" && (raw.is_creator || raw.my_status === "accepted"),
  };
}

/** Wraps `get_report_group_competency_summary`. Throws the RPC's own message on failure (e.g. group not yet closed). */
export async function getReportGroupCompetencySummary(
  groupId: string
): Promise<ReportGroupCompetencySummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_report_group_competency_summary", {
    p_group_id: groupId,
  });
  if (error) throw new Error(error.message);

  const rows = (data as RawReportGroupCompetencySummaryRow[] | null) || [];
  return rows.map((row) => ({
    competencyCode: row.competency_code,
    competencyName: row.competency_name,
    roleCode: row.role_code,
    roleName: row.role_name,
    peerAvgValue: row.peer_avg_value,
    selfAvgValue: row.self_avg_value,
    memberCount: row.member_count,
  }));
}

/** Wraps `get_my_report_groups`. No params, caller-scoped internally by the RPC. Returns `[]` when the caller has no report groups (neither created nor invited to). */
export async function getMyReportGroups(): Promise<ReportGroupSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_report_groups");
  if (error) throw new Error(error.message);

  const rows = (data as RawReportGroupSummaryRow[] | null) || [];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    createdByMemberId: row.created_by_member_id,
    isCreator: row.is_creator,
    myStatus: row.my_status,
    acceptedCount: row.accepted_count,
    totalCount: row.total_count,
  }));
}
