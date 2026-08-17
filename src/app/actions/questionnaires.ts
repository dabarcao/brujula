"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_QUESTIONS = 5;

function collectQuestions(formData: FormData, prefix: string) {
  const questions: { prompt: string; required: boolean }[] = [];
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    const prompt = String(formData.get(`${prefix}_prompt_${i}`) || "").trim();
    if (!prompt) continue;
    const required = formData.get(`${prefix}_required_${i}`) === "on";
    questions.push({ prompt, required });
  }
  return questions;
}

export async function saveOrgAdHocTemplate(formData: FormData) {
  const subtype = String(formData.get("subtype") || "");
  const name = String(formData.get("name") || "");
  const questions = collectQuestions(formData, "q");

  const supabase = await createClient();

  const { error } =
    questions.length === 0
      ? await supabase.rpc("delete_org_ad_hoc_template", { p_subtype: subtype })
      : await supabase.rpc("create_org_ad_hoc_template", {
          p_subtype: subtype,
          p_name: name,
          p_questions: questions,
        });

  if (error) {
    redirect("/dashboard/questionnaires?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/questionnaires");
  redirect("/dashboard/questionnaires?saved=1");
}

export async function saveOrg360Extra(formData: FormData) {
  const questions = collectQuestions(formData, "extra");

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_org_360_extra_questions", {
    p_questions: questions,
  });

  if (error) {
    redirect("/dashboard/questionnaires?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/questionnaires");
  redirect("/dashboard/questionnaires?saved=1");
}
