"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateAiInterpretation } from "@/lib/aiInterpretation";

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

// "El usuario es el dueño de su proceso, no las condiciones" (spec.md
// sección 4.1): finalizar es siempre una acción explícita de quien pidió
// el 360, nunca algo que pase solo por fecha o por 100% de respuestas.
// Al finalizar (close_cycle_request) se genera, en la misma llamada, la
// interpretación del perfil por IA — como cerrar ya es un evento real y
// síncrono, no hace falta ningún proceso por lotes para esto.
export async function finalizeCycleRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");

  const supabase = await createClient();

  const { error } = await supabase.rpc("close_cycle_request", { p_request_id: requestId });

  if (error) {
    redirect(`/dashboard/feedback/${requestId}?error=` + encodeURIComponent(error.message));
  }

  const result = await generateAiInterpretation(supabase, requestId);
  if (result) {
    await supabase.rpc("save_ai_interpretation", {
      p_request_id: requestId,
      p_text: result.interpretation,
    });
  }

  revalidatePath(`/dashboard/feedback/${requestId}`);
  redirect(`/dashboard/feedback/${requestId}`);
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

export async function createIndividualCycleRequest(formData: FormData) {
  const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
  const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));
  const closesAt = String(formData.get("closesAt") || "");
  const name = String(formData.get("name") || "").trim();

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_individual_cycle_request", {
    p_evaluator_emails: evaluatorEmails,
    p_evaluator_categories: categories,
    p_closes_at: closesAt,
    p_name: name || null,
  });

  if (error) {
    redirect("/dashboard/feedback/nueva-360?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function updateCycleRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const evaluatorIds = formData.getAll("evaluatorId").map(String);
  const categories = evaluatorIds.map((id) => String(formData.get(`category_${id}`) || ""));

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_cycle_request_evaluators", {
    p_request_id: requestId,
    p_evaluator_member_ids: evaluatorIds,
    p_evaluator_categories: categories,
  });

  if (error) {
    redirect(
      `/dashboard/feedback/${requestId}/gestionar?error=` + encodeURIComponent(error.message)
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
}

export async function updateIndividualCycleRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
  const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));

  const supabase = await createClient();

  const { error } = await supabase.rpc("update_individual_cycle_request_evaluators", {
    p_request_id: requestId,
    p_evaluator_emails: evaluatorEmails,
    p_evaluator_categories: categories,
  });

  if (error) {
    redirect(
      `/dashboard/feedback/${requestId}/gestionar?error=` + encodeURIComponent(error.message)
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
}
