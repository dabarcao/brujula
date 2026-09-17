"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inviteNewMember, createNewDepartment } from "@/server/managers/membersManager";

export async function inviteMember(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const departmentId = String(formData.get("departmentId") || "").trim();
  const isGuest = formData.get("isGuest") === "on";

  if (!email || !departmentId) {
    redirect(
      "/dashboard/members?error=" +
        encodeURIComponent("El email y el departamento son obligatorios.")
    );
  }

  let result: { inviteToken: string };
  try {
    result = await inviteNewMember(email, fullName, departmentId, isGuest);
  } catch (e) {
    redirect(
      "/dashboard/members?error=" +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard/members");
  redirect(
    "/dashboard/members?invited=" +
      encodeURIComponent(String(result.inviteToken)) +
      "&invitedEmail=" +
      encodeURIComponent(email)
  );
}

export async function createDepartment(formData: FormData) {
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    redirect("/dashboard/members?error=" + encodeURIComponent("El nombre es obligatorio."));
  }

  try {
    await createNewDepartment(name);
  } catch (e) {
    redirect(
      "/dashboard/members?error=" +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard/members");
  redirect("/dashboard/members");
}
