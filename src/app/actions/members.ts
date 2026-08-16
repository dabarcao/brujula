"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function inviteMember(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const departmentId = String(formData.get("departmentId") || "").trim();
  const isManager = formData.get("isManager") === "on";

  if (!email || !departmentId) {
    redirect(
      "/dashboard/members?error=" +
        encodeURIComponent("El email y el departamento son obligatorios.")
    );
  }

  const supabase = await createClient();

  const { data: inviteToken, error } = await supabase.rpc("invite_member", {
    p_email: email,
    p_full_name: fullName,
    p_department_id: departmentId,
    p_is_manager: isManager,
  });

  if (error) {
    redirect("/dashboard/members?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/members");
  redirect(
    "/dashboard/members?invited=" +
      encodeURIComponent(String(inviteToken)) +
      "&invitedEmail=" +
      encodeURIComponent(email)
  );
}

export async function createDepartment(formData: FormData) {
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    redirect("/dashboard/members?error=" + encodeURIComponent("El nombre es obligatorio."));
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_department", { p_name: name });

  if (error) {
    redirect("/dashboard/members?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/members");
  redirect("/dashboard/members");
}
