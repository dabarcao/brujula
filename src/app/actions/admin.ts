"use server";

import { redirect } from "next/navigation";
import { createOrganization, renameOrganization } from "@/server/managers/adminManager";

export async function createOrganizationAsAdmin(formData: FormData) {
  const orgName = String(formData.get("orgName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim();
  const adminFullName = String(formData.get("adminFullName") || "").trim();

  let result: { inviteToken: string };
  try {
    result = await createOrganization(orgName, adminEmail, adminFullName);
  } catch (e) {
    redirect("/admin?error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }

  redirect(
    "/admin?created=" +
      encodeURIComponent(String(result.inviteToken)) +
      "&createdEmail=" +
      encodeURIComponent(adminEmail) +
      "&createdOrg=" +
      encodeURIComponent(orgName)
  );
}

export async function updateOrganizationName(formData: FormData) {
  const orgId = String(formData.get("orgId") || "");
  const newName = String(formData.get("newName") || "").trim();

  try {
    await renameOrganization(orgId, newName);
  } catch (e) {
    redirect(
      `/admin/empresas/${orgId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  redirect(`/admin/empresas/${orgId}?updated=1`);
}
