"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  sendInvitationEmails,
  sendInvitationEmailsForNewInvitees,
  sendThankYouEmail,
} from "@/lib/invitationEmails";
import { generateAdHocInterpretation } from "@/lib/aiInterpretation";

export async function createFeedbackRequest(formData: FormData) {
  const inviteeIds = formData.getAll("inviteeIds").map(String);
  const subtype = String(formData.get("subtype") || "general");
  const name = String(formData.get("name") || "").trim();

  const supabase = await createClient();

  const { data: requestId, error } = await supabase.rpc("create_ad_hoc_feedback_request", {
    p_invitee_member_ids: inviteeIds,
    p_subtype: subtype,
    p_name: name || null,
  });

  if (error) {
    redirect("/dashboard/feedback/nueva?error=" + encodeURIComponent(error.message));
  }

  if (requestId) {
    await sendInvitationEmails(supabase, requestId);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function createFeedbackRequestForIndividual(formData: FormData) {
  const inviteeEmails = formData.getAll("inviteeEmails").map(String);
  const subtype = String(formData.get("subtype") || "general");
  const name = String(formData.get("name") || "").trim();

  const supabase = await createClient();

  const { data: requestId, error } = await supabase.rpc(
    "create_ad_hoc_feedback_request_for_individual",
    {
      p_invitee_emails: inviteeEmails,
      p_subtype: subtype,
      p_name: name || null,
    }
  );

  if (error) {
    redirect("/dashboard/feedback/nueva?error=" + encodeURIComponent(error.message));
  }

  if (requestId) {
    await sendInvitationEmails(supabase, requestId);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function cancelFeedbackRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");

  const supabase = await createClient();

  const { error } = await supabase.rpc("cancel_ad_hoc_feedback_request", {
    p_request_id: requestId,
  });

  if (error) {
    redirect(`/dashboard/feedback/${requestId}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCancelled=1");
}

export async function closeFeedbackRequest(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");

  const supabase = await createClient();

  const { error } = await supabase.rpc("close_ad_hoc_feedback_request", {
    p_request_id: requestId,
  });

  if (error) {
    redirect(`/dashboard/feedback/${requestId}?error=` + encodeURIComponent(error.message));
  }

  const interpretation = await generateAdHocInterpretation(supabase, requestId);
  if (interpretation) {
    await supabase.rpc("save_ai_interpretation", {
      p_request_id: requestId,
      p_text: interpretation.resumen,
      p_open_answers_text: interpretation.resumenAbiertas,
    });
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestClosed=1");
}

export async function updateFeedbackRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const inviteeIds = formData.getAll("inviteeIds").map(String);

  const supabase = await createClient();

  const { data: newInvites, error } = await supabase.rpc(
    "update_ad_hoc_feedback_request_evaluators",
    {
      p_request_id: requestId,
      p_invitee_member_ids: inviteeIds,
    }
  );

  if (error) {
    redirect(`/dashboard/feedback/${requestId}?error=` + encodeURIComponent(error.message));
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
  redirect(`/dashboard/feedback/${requestId}?updated=1`);
}

export async function updateFeedbackRequestEvaluatorsForIndividual(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const inviteeEmails = formData.getAll("inviteeEmails").map(String);

  const supabase = await createClient();

  const { data: newInvites, error } = await supabase.rpc(
    "update_ad_hoc_feedback_request_evaluators_for_individual",
    {
      p_request_id: requestId,
      p_invitee_emails: inviteeEmails,
    }
  );

  if (error) {
    redirect(`/dashboard/feedback/${requestId}?error=` + encodeURIComponent(error.message));
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

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("submit_feedback_response", {
    p_token: token,
    p_answers: answers,
  });

  if (error) {
    redirect(`/responder/${token}?error=` + encodeURIComponent(error.message));
  }

  // invitee_email solo viene relleno cuando quien respondió no tenía
  // cuenta (submit_feedback_response decide esa regla, no aquí) — en ese
  // caso, y solo en ese, se le manda el agradecimiento con la sugerencia
  // de registrarse.
  const inviteeEmail = data?.[0]?.invitee_email;
  if (inviteeEmail) {
    await sendThankYouEmail(supabase, inviteeEmail);
  }

  // Quien respondió por email (sin cuenta) no tiene panel al que volver —
  // se le manda de vuelta al mismo token, que ahora ya está usado y
  // muestra la pantalla de "gracias por tu feedback".
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/responder/${token}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?responded=1");
}
