"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as authManager from "@/server/managers/authManager";
import * as feedbackManager from "@/server/managers/feedbackManager";
import type { FeedbackSubtype } from "@/server/managers/feedbackManager";
import * as responderManager from "@/server/managers/responderManager";

export async function createFeedbackRequest(formData: FormData) {
  const inviteeIds = formData.getAll("inviteeIds").map(String);
  const subtype = String(formData.get("subtype") || "general");
  const name = String(formData.get("name") || "").trim();

  let requestId: string;
  try {
    ({ requestId } = await feedbackManager.createRequest(inviteeIds, subtype as FeedbackSubtype, name || null));
  } catch (e) {
    redirect(
      "/dashboard/feedback/nueva?error=" +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  // Story 7.6: triggered here rather than inside `feedbackManager.createRequest`
  // itself (the more correct home per AD-3 -- see cyclesManager.ts's
  // equivalent calls, made from inside the manager) because feedbackManager.ts
  // is owned by a parallel story landing at the same time as this one; this
  // still only calls managers (feedbackManager, then responderManager), no
  // business logic in the action itself. `responderManager.sendInvitationEmails`
  // never throws -- see its own doc comment.
  await responderManager.sendInvitationEmails(requestId);

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function createFeedbackRequestForIndividual(formData: FormData) {
  const inviteeEmails = formData.getAll("inviteeEmails").map(String);
  const subtype = String(formData.get("subtype") || "general");
  const name = String(formData.get("name") || "").trim();

  let requestId: string;
  try {
    ({ requestId } = await feedbackManager.createIndividualRequest(
      inviteeEmails,
      subtype as FeedbackSubtype,
      name || null
    ));
  } catch (e) {
    redirect(
      "/dashboard/feedback/nueva?error=" +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  // See createFeedbackRequest's own comment just above.
  await responderManager.sendInvitationEmails(requestId);

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function cancelFeedbackRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");

  try {
    await feedbackManager.cancelRequest(requestId);
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCancelled=1");
}

export async function closeFeedbackRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");

  try {
    await feedbackManager.closeRequest(requestId);
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestClosed=1");
}

export async function updateFeedbackRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const inviteeIds = formData.getAll("inviteeIds").map(String);

  try {
    await feedbackManager.updateRequestEvaluators(requestId, inviteeIds);
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}?updated=1`);
}

/** Individual-account counterpart of updateFeedbackRequestEvaluators above (email invitees, not member ids) -- closes the Story 7.6 scope note above. */
export async function updateFeedbackRequestEvaluatorsForIndividual(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const inviteeEmails = formData.getAll("inviteeEmails").map(String);

  try {
    await feedbackManager.updateRequestEvaluatorsForIndividual(requestId, inviteeEmails);
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}?updated=1`);
}

type FeedbackAnswer = {
  question_id: string;
  answer_text?: string;
  answer_value?: number | null;
  competency_code?: string;
};

export async function submitFeedbackResponse(formData: FormData) {
  const token = String(formData.get("token") || "");
  const questionIds = formData.getAll("questionId").map(String);
  const questionTypes = formData.getAll("questionType").map(String);

  const answers: FeedbackAnswer[] = [];

  questionIds.forEach((questionId, index) => {
    const type = questionTypes[index];

    if (type === "competency") {
      const codes = formData.getAll(`competency_${questionId}`).map(String);
      codes.forEach((code) => {
        const rawValue = String(formData.get(`competency_value_${questionId}_${code}`) || "");
        answers.push({
          question_id: questionId,
          competency_code: code,
          answer_value: rawValue ? Number(rawValue) : null,
          answer_text: String(formData.get(`competency_text_${questionId}_${code}`) || ""),
        });
      });
      return;
    }

    const rawValue = String(formData.get(`answer_${questionId}`) || "");
    answers.push(
      type === "scale"
        ? { question_id: questionId, answer_value: rawValue ? Number(rawValue) : null }
        : { question_id: questionId, answer_text: rawValue }
    );
  });

  try {
    await responderManager.submitResponse(
      token,
      answers.map((a) => ({
        questionId: a.question_id,
        answerText: a.answer_text,
        answerValue: a.answer_value,
        competencyCode: a.competency_code,
      }))
    );
  } catch (e) {
    redirect(
      `/responder/${token}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  // Quien respondió por email (sin cuenta) no tiene panel al que volver —
  // se le manda de vuelta al mismo token, que ahora ya está usado y
  // muestra la pantalla de "gracias por tu feedback".
  const user = await authManager.getCurrentUser();

  if (!user) {
    redirect(`/responder/${token}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?responded=1");
}
