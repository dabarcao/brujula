"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFeedbackCycle(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const opensAt = String(formData.get("opensAt") || "");
  const closesAt = String(formData.get("closesAt") || "");
  const participantIds = formData.getAll("participantId").map(String);

  if (!name || !opensAt || !closesAt) {
    redirect(
      "/dashboard/cycles/nueva?error=" + encodeURIComponent("Rellena todos los campos.")
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_feedback_cycle", {
    p_name: name,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_participant_member_ids: participantIds,
  });

  if (error) {
    redirect("/dashboard/cycles/nueva?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?cycleCreated=1");
}

export async function organizeCycleEvaluators(formData: FormData) {
  const cycleId = String(formData.get("cycleId") || "");
  const evaluatorIds = formData.getAll("evaluatorId").map(String);
  const categories = evaluatorIds.map((id) => String(formData.get(`category_${id}`) || ""));

  const supabase = await createClient();

  const { error } = await supabase.rpc("organize_cycle_evaluators", {
    p_cycle_id: cycleId,
    p_evaluator_member_ids: evaluatorIds,
    p_evaluator_categories: categories,
  });

  if (error) {
    redirect(`/dashboard/cycles/${cycleId}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?cycleOrganized=1");
}
