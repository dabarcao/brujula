"use server";

import { redirect } from "next/navigation";
import {
  createOrganization,
  renameOrganization,
  editMemberProfile,
  locateMemberByEmail,
} from "@/server/managers/adminManager";

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

export async function updateMemberAsAdmin(formData: FormData) {
  const memberId = String(formData.get("memberId") || "");
  const orgId = String(formData.get("orgId") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();

  try {
    await editMemberProfile(memberId, fullName, email);
  } catch (e) {
    redirect(
      `/admin/empresas/${orgId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  redirect(`/admin/empresas/${orgId}?memberUpdated=1`);
}

export async function findMemberAsAdmin(formData: FormData) {
  const email = String(formData.get("searchEmail") || "").trim();
  const errorRedirectPath = "/admin/gestion/buscar-empleado";

  let location: Awaited<ReturnType<typeof locateMemberByEmail>>;
  try {
    location = await locateMemberByEmail(email);
  } catch (e) {
    redirect(
      `${errorRedirectPath}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  if (!location) {
    redirect(
      `${errorRedirectPath}?error=` +
        encodeURIComponent(`No existe ningún empleado con el email "${email}".`)
    );
  }

  redirect(`/admin/empresas/${location.organizationId}`);
}
