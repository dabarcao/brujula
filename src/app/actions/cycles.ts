"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as cyclesManager from "@/server/managers/cyclesManager";
import type { CycleParticipantCategory } from "@/server/managers/cyclesManager";
import * as aiInterpretationManager from "@/server/managers/aiInterpretationManager";

// Story 3.10 (_bmad-output/implementation-artifacts/
// spec-3-10-cycles-server-actions-thin-delegates.md) introduced these 6
// Server Actions as thin delegates to @/server/managers/cyclesManager, each
// call site checking once. Story 5.1a (spec-5-1a-delete-old-path-cycles.md)
// removed the old direct-Supabase path and the per-domain rollback-safety
// flag that gated it -- these are now the only path.
// `finalizeCycleRequest`'s AI-interpretation orchestration now goes through
// `aiInterpretationManager` (Story 7.3) -- this file no longer constructs a
// raw Supabase client at all, closing the 3rd and last eslint.config.mjs
// `no-restricted-imports` exemption (removed by that same story). Still
// called unconditionally and result-unchecked: generation/save are both
// best-effort (never throw), same as before.

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

  try {
    await cyclesManager.createCycle(name, opensAt, closesAt, participantIds);
  } catch (e) {
    redirect(
      "/dashboard/cycles/nueva?error=" +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
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

  try {
    await cyclesManager.closeRequest(requestId);
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  // Story 7.3: `aiInterpretationManager.generateProfileInterpretation` +
  // `saveProfileInterpretation` replace the old raw-Supabase-client call
  // into src/lib/aiInterpretation.ts -- both never throw (missing API key,
  // empty data, a failed Anthropic call, or a save failure all resolve
  // silently), same contract the original call site had.
  const result = await aiInterpretationManager.generateProfileInterpretation(requestId);
  if (result) {
    await aiInterpretationManager.saveProfileInterpretation(requestId, result);
  }

  revalidatePath(`/dashboard/feedback/${requestId}`);
  redirect(`/dashboard/feedback/${requestId}`);
}

export async function organizeCycleEvaluators(formData: FormData) {
  const cycleId = String(formData.get("cycleId") || "");
  const evaluatorIds = formData.getAll("evaluatorId").map(String);
  const categories = evaluatorIds.map((id) => String(formData.get(`category_${id}`) || ""));

  try {
    await cyclesManager.organizeEvaluators(
      cycleId,
      evaluatorIds,
      categories as CycleParticipantCategory[]
    );
  } catch (e) {
    redirect(
      `/dashboard/cycles/${cycleId}?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?cycleOrganized=1");
}

export async function createIndividualCycleRequest(formData: FormData) {
  const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
  const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));
  const closesAt = String(formData.get("closesAt") || "");
  const name = String(formData.get("name") || "").trim();

  try {
    await cyclesManager.createIndividualRequest(
      evaluatorEmails,
      categories as CycleParticipantCategory[],
      closesAt,
      name || null
    );
  } catch (e) {
    redirect(
      "/dashboard/feedback/nueva-360?error=" +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?requestCreated=1");
}

export async function updateCycleRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const evaluatorIds = formData.getAll("evaluatorId").map(String);
  const categories = evaluatorIds.map((id) => String(formData.get(`category_${id}`) || ""));

  try {
    await cyclesManager.updateRequestEvaluators(
      requestId,
      evaluatorIds,
      categories as CycleParticipantCategory[]
    );
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}/gestionar?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
}

export async function updateIndividualCycleRequestEvaluators(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const evaluatorEmails = formData.getAll("evaluatorEmails").map(String);
  const categories = evaluatorEmails.map((email) => String(formData.get(`category_${email}`) || ""));

  try {
    await cyclesManager.updateIndividualRequestEvaluators(
      requestId,
      evaluatorEmails,
      categories as CycleParticipantCategory[]
    );
  } catch (e) {
    redirect(
      `/dashboard/feedback/${requestId}/gestionar?error=` +
        encodeURIComponent(e instanceof Error ? e.message : String(e))
    );
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/feedback/${requestId}/gestionar?updated=1`);
}
