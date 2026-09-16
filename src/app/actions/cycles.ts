"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateAiInterpretation } from "@/lib/aiInterpretation";
import { sendInvitationEmails, sendInvitationEmailsForNewInvitees } from "@/lib/invitationEmails";

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
      p_text: result.competencias,
      p_saboteadores_text: result.saboteadores,
      p_open_answers_text: result.resumenAbiertas,
    });
  }

  revalidatePath(`/dashboard/feedback/${requestId}`);
  redirect(`/dashboard/feedback/${requestId}`);
}

// Devuelven el resultado en vez de redirigir: el asistente de onboarding
// (Onboarding360Wizard) necesita quedarse en el paso de selección para
// mostrar el error, o pasar al paso de confirmación tras el éxito, sin que
// una redirección de servidor le arrebate el control de en qué pantalla
// está el usuario.
type EvaluatorActionState = { error: string } | { success: true };

export async function organizeCycleEvaluators(
  _prevState: EvaluatorActionState | null,
  formData: FormData
): Promise<EvaluatorActionState> {
  const cycleId = String(formData.get("cycleId") || "");
  const evaluatorIds = formData.getAll("evaluatorId").map(String);
  const categories = evaluatorIds.map((id) => String(formData.get(`category_${id}`) || ""));

  const supabase = await createClient();

  const { data: requestId, error } = await supabase.rpc("organize_cycle_evaluators", {
    p_cycle_id: cycleId,
    p_evaluator_member_ids: evaluatorIds,
    p_evaluator_categories: categories,
  });

  if (error) {
    return { error: error.message };
  }

  if (requestId) {
    await sendInvitationEmails(supabase, requestId);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function createIndividualCycleRequest(
  _prevState: EvaluatorActionState | null,
  formData: FormData
): Promise<EvaluatorActionState> {
  const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
  const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));
  const closesAt = String(formData.get("closesAt") || "");
  const name = String(formData.get("name") || "").trim();

  const supabase = await createClient();

  const { data: requestId, error } = await supabase.rpc("create_individual_cycle_request", {
    p_evaluator_emails: evaluatorEmails,
    p_evaluator_categories: categories,
    p_closes_at: closesAt,
    p_name: name || null,
  });

  if (error) {
    return { error: error.message };
  }

  if (requestId) {
    await sendInvitationEmails(supabase, requestId);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateCycleRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const evaluatorIds = formData.getAll("evaluatorId").map(String);
  const categories = evaluatorIds.map((id) => String(formData.get(`category_${id}`) || ""));

  const supabase = await createClient();

  const { data: newInvites, error } = await supabase.rpc("update_cycle_request_evaluators", {
    p_request_id: requestId,
    p_evaluator_member_ids: evaluatorIds,
    p_evaluator_categories: categories,
  });

  if (error) {
    redirect(
      `/dashboard/feedback/${requestId}/gestionar?error=` + encodeURIComponent(error.message)
    );
  }

  if (newInvites && newInvites.length > 0) {
    const memberIds = newInvites.map((n: { invitee_member_id: string }) => n.invitee_member_id);
    const { data: newMembers } = await supabase.from("members").select("id, email").in("id", memberIds);
    const emailById = new Map((newMembers || []).map((m) => [m.id, m.email]));
    const invitees = newInvites
      .map((n: { invitee_member_id: string; token: string }) => ({
        email: emailById.get(n.invitee_member_id),
        token: n.token,
      }))
      .filter((i: { email?: string; token: string }): i is { email: string; token: string } => !!i.email);
    await sendInvitationEmailsForNewInvitees(supabase, requestId, invitees);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
}

export async function updateIndividualCycleRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
  const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));

  const supabase = await createClient();

  const { data: newInvites, error } = await supabase.rpc(
    "update_individual_cycle_request_evaluators",
    {
      p_request_id: requestId,
      p_evaluator_emails: evaluatorEmails,
      p_evaluator_categories: categories,
    }
  );

  if (error) {
    redirect(
      `/dashboard/feedback/${requestId}/gestionar?error=` + encodeURIComponent(error.message)
    );
  }

  if (newInvites && newInvites.length > 0) {
    await sendInvitationEmailsForNewInvitees(
      supabase,
      requestId,
      newInvites.map((n: { invitee_email: string; token: string }) => ({
        email: n.invitee_email,
        token: n.token,
      }))
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
}
