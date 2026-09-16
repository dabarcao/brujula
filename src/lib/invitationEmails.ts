import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, getSiteUrl } from "@/lib/email";
import { getPlatformText } from "@/lib/platformTexts";

// Se llama justo después de crear con éxito cualquier solicitud que
// genere invitaciones (360 de empresa, 360 individual, ágil de empresa,
// ágil individual) — nunca dentro de la propia RPC (Postgres no puede
// llamar a la API de Resend), siempre desde la Server Action que la
// envuelve. No se le manda email a la invitación "self" — quien acaba de
// crear la solicitud ya sabe que tiene que autoevaluarse, un aviso en
// ese momento sería redundante.
// Junta lo que necesitan tanto el envío inicial como el de "añadir más
// evaluadores": nombre de quien pide el feedback + plantillas ya
// interpoladas. null si la solicitud no existe (no debería pasar salvo
// carrera rara, pero mejor no reventar el envío por eso).
async function buildInvitationEmailContext(supabase: SupabaseClient, requestId: string) {
  const { data: request } = await supabase
    .from("feedback_requests")
    .select("requester_member_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return null;

  const { data: requester } = await supabase
    .from("members")
    .select("full_name, email")
    .eq("id", request.requester_member_id)
    .maybeSingle();

  const requesterName = requester?.full_name || requester?.email || "Alguien";

  const [subjectTemplate, bodyTemplate] = await Promise.all([
    getPlatformText(supabase, "invitation_email_subject", "{nombre} te pide tu feedback"),
    getPlatformText(
      supabase,
      "invitation_email_body",
      "**{nombre}** te pide que le des tu feedback en Brújula.\n\nEs completamente anónimo — nadie sabrá qué respondiste, ni siquiera {nombre}. Te llevará solo unos minutos."
    ),
  ]);

  return {
    subject: subjectTemplate.replaceAll("{nombre}", requesterName),
    bodyHtml: markdownLiteToHtml(bodyTemplate.replaceAll("{nombre}", requesterName)),
    siteUrl: getSiteUrl(),
  };
}

export async function sendInvitationEmails(
  supabase: SupabaseClient,
  requestId: string
): Promise<void> {
  const { data: invitations } = await supabase
    .from("feedback_invitations")
    .select("token, invitee_email, invitee_member_id, evaluator_category, members(email)")
    .eq("feedback_request_id", requestId)
    .neq("evaluator_category", "self");

  if (!invitations || invitations.length === 0) return;

  const ctx = await buildInvitationEmailContext(supabase, requestId);
  if (!ctx) return;

  for (const invite of (invitations as unknown as InvitationRow[] | null) || []) {
    const email = invite.invitee_email || invite.members?.email;
    if (!email) continue;

    await sendEmail({
      to: email,
      subject: ctx.subject,
      html: invitationEmailHtml({ bodyHtml: ctx.bodyHtml, link: `${ctx.siteUrl}/responder/${invite.token}` }),
    });
  }
}

// Se llama justo después de añadir más evaluadores a una solicitud ágil
// ya existente — a diferencia de sendInvitationEmails, aquí la lista de
// invitados ya viene decidida de antemano (solo los recién añadidos por
// update_ad_hoc_feedback_request_evaluators[_for_individual], que ahora
// solo inserta filas nuevas y nunca toca el token de quien ya estaba
// invitado), así que no hace falta volver a consultar quién es "nuevo".
export async function sendInvitationEmailsForNewInvitees(
  supabase: SupabaseClient,
  requestId: string,
  invitees: { email: string; token: string }[]
): Promise<void> {
  if (invitees.length === 0) return;

  const ctx = await buildInvitationEmailContext(supabase, requestId);
  if (!ctx) return;

  for (const { email, token } of invitees) {
    await sendEmail({
      to: email,
      subject: ctx.subject,
      html: invitationEmailHtml({ bodyHtml: ctx.bodyHtml, link: `${ctx.siteUrl}/responder/${token}` }),
    });
  }
}

// Se llama justo después de que alguien SIN cuenta (invitación por email
// suelto, nunca un member existente) responda con éxito — nunca para la
// propia autoevaluación. submit_feedback_response ya decide a quién le
// toca (devuelve invitee_email solo en ese caso concreto), así que aquí
// no hay que repetir esa lógica, solo enviar si llega un email.
export async function sendThankYouEmail(supabase: SupabaseClient, email: string): Promise<void> {
  const [subject, bodyTemplate] = await Promise.all([
    getPlatformText(supabase, "thank_you_email_subject", "Gracias por tu feedback"),
    getPlatformText(
      supabase,
      "thank_you_email_body",
      "Gracias por dedicar unos minutos a dar tu feedback.\n\n**Tú también puedes pedir feedback a tu alrededor** — es gratis empezar."
    ),
  ]);

  const siteUrl = getSiteUrl();

  await sendEmail({
    to: email,
    subject,
    html: thankYouEmailHtml({
      bodyHtml: markdownLiteToHtml(bodyTemplate),
      link: `${siteUrl}/registro`,
    }),
  });
}

function thankYouEmailHtml({ bodyHtml, link }: { bodyHtml: string; link: string }) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p>Hola,</p>
      ${bodyHtml}
      <p style="margin: 32px 0;">
        <a
          href="${link}"
          style="background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;"
        >
          Crear mi cuenta
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">— Brújula</p>
    </div>
  `;
}

type InvitationRow = {
  token: string;
  invitee_email: string | null;
  invitee_member_id: string | null;
  evaluator_category: string;
  members: { email: string } | null;
};

function invitationEmailHtml({ bodyHtml, link }: { bodyHtml: string; link: string }) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p>Hola,</p>
      ${bodyHtml}
      <p style="margin: 32px 0;">
        <a
          href="${link}"
          style="background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;"
        >
          Dar mi feedback
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">— Brújula</p>
    </div>
  `;
}

// Mismo criterio que FormattedText.tsx (wizard/Biblioteca) — **negrita** y
// párrafos separados por línea en blanco, la única sintaxis que se
// interpreta. Versión en string/HTML en vez de React porque un email es
// un string de HTML, no un árbol de componentes. Se escapa primero para
// que el texto editable en platform_texts nunca pueda inyectar HTML.
function markdownLiteToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph);
      const bold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<p>${bold}</p>`;
    })
    .join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
