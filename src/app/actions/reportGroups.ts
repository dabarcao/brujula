"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateReportGroupInterpretation } from "@/lib/aiInterpretation";

export async function createReportGroup(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const memberIds = formData.getAll("memberId").map(String);

  const supabase = await createClient();

  const { data: groupId, error } = await supabase.rpc("create_report_group", {
    p_name: name,
    p_member_ids: memberIds,
  });

  if (error) {
    redirect("/dashboard/groups/nuevo?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/groups/${groupId}`);
}

export async function respondToReportGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");
  const accept = formData.get("accept") === "true";

  const supabase = await createClient();

  const { error } = await supabase.rpc("respond_to_report_group", {
    p_group_id: groupId,
    p_accept: accept,
  });

  if (error) {
    redirect(`/dashboard/groups/${groupId}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/groups/${groupId}`);
}

// Cualquiera de los ya aceptados puede cerrarlo (spec.md sección 17,
// "el usuario es el dueño de su proceso", aquí en plural) — igual que en
// finalizeCycleRequest, cerrar es un evento síncrono real, así que la
// interpretación por IA se genera en la misma llamada, sin lote nocturno.
export async function closeReportGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");

  const supabase = await createClient();

  const { error } = await supabase.rpc("close_report_group", { p_group_id: groupId });

  if (error) {
    redirect(`/dashboard/groups/${groupId}?error=` + encodeURIComponent(error.message));
  }

  const interpretation = await generateReportGroupInterpretation(supabase, groupId);
  if (interpretation) {
    await supabase.rpc("save_report_group_interpretation", {
      p_group_id: groupId,
      p_text: interpretation,
    });
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
  redirect(`/dashboard/groups/${groupId}`);
}
