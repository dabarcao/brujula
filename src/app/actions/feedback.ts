"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFeedbackRequest(formData: FormData) {
  const inviteeIds = formData.getAll("inviteeIds").map(String);

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_ad_hoc_feedback_request", {
    p_invitee_member_ids: inviteeIds,
  });

  if (error) {
    redirect("/dashboard/feedback/nueva?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function submitFeedbackResponse(formData: FormData) {
  const token = String(formData.get("token") || "");
  const questionIds = formData.getAll("questionId").map(String);
  const questionTypes = formData.getAll("questionType").map(String);

  const answers = questionIds.map((questionId, index) => {
    const rawValue = String(formData.get(`answer_${questionId}`) || "");
    return questionTypes[index] === "scale"
      ? { question_id: questionId, answer_value: rawValue ? Number(rawValue) : null }
      : { question_id: questionId, answer_text: rawValue };
  });

  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_feedback_response", {
    p_token: token,
    p_answers: answers,
  });

  if (error) {
    redirect(`/responder/${token}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?responded=1");
}
