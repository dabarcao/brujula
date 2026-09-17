"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createGroup,
  addMembers,
  removeMember,
  respondToGroup,
  closeGroup,
} from "@/server/managers/reportGroupsManager";

// Story 1.6 (_bmad-output/implementation-artifacts/
// spec-1-6-report-groups-server-actions-become-thin-delegates.md): these
// three actions are thin FormData-parsing delegates to reportGroupsManager
// (Story 1.2) -- redirect()/revalidatePath() stay here (Next.js-specific,
// per AD-3/AD-4), all business logic and RPC calls live in the manager.

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createReportGroup(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const memberIds = formData.getAll("memberId").map(String);

  let groupId: string;
  try {
    ({ groupId } = await createGroup(name, memberIds));
  } catch (error) {
    console.error("[createReportGroup] reportGroupsManager.createGroup failed:", error);
    redirect("/dashboard/groups/nuevo?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/groups/${groupId}`);
}

export async function respondToReportGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");
  const accept = formData.get("accept") === "true";

  try {
    await respondToGroup(groupId, accept);
  } catch (error) {
    console.error("[respondToReportGroup] reportGroupsManager.respondToGroup failed:", error);
    redirect(`/dashboard/groups/${groupId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/groups/${groupId}`);
}

// 2026-09-17: invitar a más gente o quitar a alguien de un grupo todavía
// abierto -- mismos delegates finos que el resto de este archivo,
// reportGroupsManager.addMembers/removeMember llevan toda la lógica real
// (validación de elegibilidad, email a los nuevos invitados).
export async function addReportGroupMembers(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");
  const memberIds = formData.getAll("memberId").map(String);

  try {
    await addMembers(groupId, memberIds);
  } catch (error) {
    console.error("[addReportGroupMembers] reportGroupsManager.addMembers failed:", error);
    redirect(`/dashboard/groups/${groupId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
  redirect(`/dashboard/groups/${groupId}`);
}

export async function removeReportGroupMember(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");
  const memberId = String(formData.get("memberId") || "");

  try {
    await removeMember(groupId, memberId);
  } catch (error) {
    console.error("[removeReportGroupMember] reportGroupsManager.removeMember failed:", error);
    redirect(`/dashboard/groups/${groupId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
  redirect(`/dashboard/groups/${groupId}`);
}

// Cualquiera de los ya aceptados puede cerrarlo (spec.md sección 17,
// "el usuario es el dueño de su proceso", aquí en plural) — igual que en
// finalizeCycleRequest, cerrar es un evento síncrono real, así que la
// interpretación por IA se genera en la misma llamada, sin lote nocturno.
// reportGroupsManager.closeGroup ya genera y guarda esa interpretación
// internamente (Story 1.2) -- este delegate no necesita tocarla.
//
// Nota conocida y ya aceptada (spec-1-6, "Known, already-accepted
// behavioral note"): si closeReportGroup (la RPC) tiene éxito pero el
// guardado posterior de la interpretación falla, closeGroup lanza igual
// -- este catch redirige a la página de error aunque el grupo SÍ se haya
// cerrado. El código original nunca comprobaba el error de ese guardado,
// así que siempre redirigía a éxito en ese caso concreto. No se arregla
// aquí -- requiere que closeGroup devuelva un resultado más rico
// (deferred-work.md).
export async function closeReportGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");

  try {
    await closeGroup(groupId);
  } catch (error) {
    console.error("[closeReportGroup] reportGroupsManager.closeGroup failed:", error);
    redirect(`/dashboard/groups/${groupId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
  redirect(`/dashboard/groups/${groupId}`);
}
