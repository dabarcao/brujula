"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganizationAsAdmin(formData: FormData) {
  const orgName = String(formData.get("orgName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim();
  const adminFullName = String(formData.get("adminFullName") || "").trim();

  const supabase = await createClient();

  const { data: inviteToken, error } = await supabase.rpc("create_organization_as_admin", {
    p_org_name: orgName,
    p_admin_email: adminEmail,
    p_admin_full_name: adminFullName,
  });

  if (error) {
    redirect("/admin?error=" + encodeURIComponent(error.message));
  }

  redirect(
    "/admin?created=" +
      encodeURIComponent(String(inviteToken)) +
      "&createdEmail=" +
      encodeURIComponent(adminEmail) +
      "&createdOrg=" +
      encodeURIComponent(orgName)
  );
}

export async function updateOrganizationName(formData: FormData) {
  const orgId = String(formData.get("orgId") || "");
  const newName = String(formData.get("newName") || "").trim();

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_organization_name", {
    p_org_id: orgId,
    p_new_name: newName,
  });

  if (error) {
    redirect("/admin?error=" + encodeURIComponent(error.message));
  }

  redirect("/admin?updated=1");
}
